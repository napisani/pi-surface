import { applyPatch } from "../../../src/host/patch.ts";
import { messageOf, type SurfaceContext, SurfaceError, type WorkflowSession } from "../../../src/host/workflow.ts";
import type { Anchor, LabeledVisual } from "../../../src/kit/code.ts";
import { blobRoute, parseDiffFiles, readBlob } from "../../../src/kit/git.ts";
import { resolveAction, type PageAction } from "./actions.ts";
import { listReviewComments, loadTarget, postReviewComment, remoteHead, reviewDiff, type OpenInput } from "./github.ts";
import {
  addComment,
  addFindingMessage,
  addQuestionMessage,
  commentOf,
  editComment,
  findingAnchor,
  findingOf,
  finishPosting,
  loadReview,
  moveComment,
  postFindings,
  postWalkthrough,
  refreshReview,
  requestOf,
  revisions,
  setAnchorText,
  setTaskStatus,
  updateRequests,
  type FindingsInput,
  type RequestUpdate,
  type ReviewState,
  type Target,
  type TaskKind,
  type WalkthroughInput,
} from "./state.ts";

export interface CommentDraftInput {
  commentId?: string;
  findingId?: string;
  anchor?: Anchor;
  body: string;
  note?: string;
}

export class ReviewSession implements WorkflowSession<PageAction> {
  readonly #ctx: SurfaceContext<ReviewState>;
  /** The diff for the current revision; never persisted, since the worktree is the source. */
  #diff: { revision: number; text: string } | undefined;
  /** Settles when every GitHub call started by the page has finished; tests await it. */
  idle: Promise<void> = Promise.resolve();
  readonly routes: Record<string, (query: URLSearchParams) => Promise<string>>;

  constructor(ctx: SurfaceContext<ReviewState>) {
    this.#ctx = ctx;
    this.routes = {
      diff: () => this.readDiff(),
      blob: blobRoute(ctx.runner, () => revisions(this.#target())),
    };
  }

  get state(): ReviewState {
    return this.#ctx.store.state;
  }

  #commit = (ops: Parameters<SurfaceContext<ReviewState>["commit"]>[0]) => this.#ctx.commit(ops);

  #target(): Target {
    const target = this.state.target;
    if (!target) {
      throw new SurfaceError("nothing is loaded; call surface_review_open first");
    }
    return target;
  }

  status(): string | undefined {
    const s = this.state;
    if (!s.target) {
      return undefined;
    }
    const pending = s.requests.filter((q) => q.status === "pending").length;
    const drafts = s.comments.filter((c) => c.status === "draft" || c.status === "failed").length;
    const parts = [s.pr ? `pr #${s.pr.number}` : "local", ...(s.target.mode === "live" ? [`${pending} pending`] : []), ...(s.pr ? [`${drafts} draft${drafts === 1 ? "" : "s"}`] : [])];
    return parts.join(" · ");
  }

  url(): Promise<string> {
    return this.#ctx.url();
  }

  /** Loads local changes or a PR, then returns the page URL. */
  async open(input: OpenInput): Promise<string> {
    await this.#load(input);
    return this.url();
  }

  // Refreshes load without asking for the URL, which would open the browser the first time.
  async #load(input: OpenInput): Promise<void> {
    const revision = (this.state.target?.revision ?? 0) + 1;
    const runner = this.#ctx.runner;
    const { target, pr } = await loadTarget(runner, input, this.#ctx.now(), revision);
    const text = await reviewDiff(runner, target);
    const remote = pr ? await listReviewComments(runner, target, pr) : [];
    this.#diff = { revision, text };
    this.#commit(loadReview(this.state, target, pr, parseDiffFiles(text), remote));
  }

  /**
   * Re-reads what the page compares. A live review picks up edits, commits and
   * PR pushes; a pinned one keeps its commit and refreshes only GitHub's threads.
   */
  async refresh(): Promise<void> {
    const state = this.state;
    const target = this.#target();
    const runner = this.#ctx.runner;
    if (target.mode === "live") {
      await this.#load({ worktree: target.worktree, ...(state.pr ? { pr: state.pr.url } : { base: target.baseRef }), live: true });
      return;
    }
    const pr = state.pr!;
    const [remote, head] = await Promise.all([listReviewComments(runner, target, pr), remoteHead(runner, target, pr)]);
    this.#commit(refreshReview(this.state, target, state.files, { remote, remoteHeadSha: head }));
  }

  async readDiff(): Promise<string> {
    const target = this.#target();
    if (this.#diff?.revision === target.revision) {
      return this.#diff.text;
    }
    // After a resume nothing is cached and the worktree may have moved on; a live review reloads.
    if (target.mode === "live") {
      await this.refresh();
      return this.#diff!.text;
    }
    const text = await reviewDiff(this.#ctx.runner, target);
    this.#diff = { revision: target.revision, text };
    return text;
  }

  setTaskStatus(kind: TaskKind, status: "running" | "failed", note: string): void {
    this.#commit(setTaskStatus(this.state, kind, status, note, this.#ctx.now()));
  }

  postFindings(input: FindingsInput): void {
    this.#commit(postFindings(this.state, input, this.#ctx.now()));
  }

  postWalkthrough(input: WalkthroughInput): void {
    this.#commit(postWalkthrough(this.state, input, this.#ctx.now()));
  }

  findingReply(findingId: string, text: string, visuals: LabeledVisual[] = []): void {
    this.#commit(addFindingMessage(this.state, findingId, { role: "agent", text, at: this.#ctx.now() }, visuals));
  }

  questionReply(questionId: string, text: string, visuals: LabeledVisual[] = []): void {
    this.#commit(addQuestionMessage(this.state, questionId, { role: "agent", text, at: this.#ctx.now() }, visuals));
  }

  /** Refreshes the files the agent just edited, then records its outcome for each request. */
  async updateRequests(updates: RequestUpdate[]): Promise<void> {
    for (const u of updates) {
      requestOf(this.state, u.requestId);
    }
    await this.refresh();
    this.#commit(updateRequests(this.state, updates, this.#ctx.now()));
  }

  /**
   * Revises a draft, or creates one (from a finding when findingId is set).
   * Never posts; returns the draft's id.
   */
  draftComment(input: CommentDraftInput): string {
    const state = this.state;
    const now = this.#ctx.now();
    if (input.commentId) {
      commentOf(state, input.commentId);
      const ops = editComment(state, input.commentId, input.body, now, input.note);
      const moved = input.anchor ? moveComment(applyPatch(structuredClone(state), ops), input.commentId, input.anchor, now) : [];
      this.#commit([...ops, ...moved]);
      return input.commentId;
    }
    const finding = input.findingId ? findingOf(state, input.findingId) : undefined;
    const anchor = input.anchor ?? (finding ? findingAnchor(finding) : undefined);
    if (!anchor) {
      throw new SurfaceError("a new comment needs an anchor or a findingId");
    }
    if (!input.body.trim()) {
      throw new SurfaceError("a comment needs a body");
    }
    const { ops, id } = addComment(
      state,
      {
        anchor,
        body: input.body,
        origin: finding ? { kind: "finding", findingId: finding.id, findingTitle: finding.title } : undefined,
        agentNote: input.note,
      },
      now,
    );
    this.#commit(ops);
    return id;
  }

  async handleAction(action: PageAction): Promise<void> {
    const { ops, message, effect } = resolveAction(this.state, action, this.#ctx.now());
    this.#commit(ops);
    if (message) {
      this.#ctx.notifyAgent(message.content, message.details);
    }
    if (effect?.kind === "post") {
      this.idle = Promise.all([this.idle, this.#post(effect.commentId)]).then(() => undefined);
    }
    if (effect?.kind === "anchorText") {
      await this.#recordAnchorText(effect.requestId);
    }
    if (effect?.kind === "refresh") {
      try {
        await this.refresh();
      } catch (error) {
        throw new SurfaceError(`refresh failed: ${messageOf(error)}`);
      }
    }
  }

  /** Keeps the anchored line's text with the request, so the agent can find it after line numbers shift. */
  async #recordAnchorText(requestId: string): Promise<void> {
    const anchor = requestOf(this.state, requestId).anchor!;
    const target = this.#target();
    const text = await readBlob(this.#ctx.runner, revisions(target), anchor.side === "LEFT" ? "base" : "work", anchor.path).catch(() => undefined);
    const line = text?.split("\n")[anchor.line - 1];
    if (line !== undefined) {
      this.#commit(setAnchorText(this.state, requestId, line));
    }
  }

  async #post(commentId: string): Promise<void> {
    const state = this.state;
    const comment = commentOf(state, commentId);
    const result = await postReviewComment(this.#ctx.runner, this.#target(), state.pr!, comment).catch((error: Error) => ({ error: error.message }));
    this.#commit(finishPosting(this.state, commentId, result, this.#ctx.now()));
  }
}
