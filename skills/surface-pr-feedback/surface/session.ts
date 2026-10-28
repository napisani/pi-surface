import type { PatchOp } from "../../../src/host/patch.ts";
import { messageOf, type SurfaceContext, SurfaceError, type WorkflowSession } from "../../../src/host/workflow.ts";
import type { LabeledVisual } from "../../../src/kit/code.ts";
import { blobRoute, parseDiffFiles } from "../../../src/kit/git.ts";
import { resolveAction, triageBrief, type PageAction } from "./actions.ts";
import { commitPaths, containedIn, feedbackDiff, listFeedback, loadTarget, postReply, push, resolveReviewThread, type OpenInput, type PostedReply } from "./github.ts";
import {
  addChatItems,
  addDiscussion,
  commitOf,
  finishCommit,
  finishPosting,
  finishPush,
  itemOf,
  loadFeedback,
  markPushed,
  markResolved,
  postAnalyses,
  postedBody,
  proposeCommits,
  resolvableThread,
  revisions,
  setTaskStatus,
  startTask,
  untriaged,
  updateFixes,
  writeReply,
  type AnalysisInput,
  type ChatItemInput,
  type CommitInput,
  type FeedbackState,
  type FixUpdate,
  type TaskName,
} from "./state.ts";

export interface Opened {
  url: string;
  warning?: string;
  /** The triage request when items still need analysis; triage is then marked running. */
  triage?: string;
}

/** Items added from chat, and the brief that asks the agent to triage them. */
export interface ChatTriage {
  ids: string[];
  triage: string;
}

export class FeedbackSession implements WorkflowSession<PageAction> {
  readonly #ctx: SurfaceContext<FeedbackState>;
  /** The diff for the current revision; never persisted, since the worktree is the source. */
  #diff: { revision: number; text: string } | undefined;
  /** Settles when every git or GitHub call started by the page has finished; tests await it. */
  idle: Promise<void> = Promise.resolve();
  readonly routes: Record<string, (query: URLSearchParams) => Promise<string>>;

  constructor(ctx: SurfaceContext<FeedbackState>) {
    this.#ctx = ctx;
    this.routes = {
      diff: () => this.readDiff(),
      blob: blobRoute(ctx.runner, () => revisions(this.#target(), this.state.pr)),
    };
  }

  get state(): FeedbackState {
    return this.#ctx.store.state;
  }

  #commit(ops: PatchOp[]): void {
    this.#ctx.commit(ops);
  }

  #now(): string {
    return this.#ctx.now();
  }

  #target() {
    const target = this.state.target;
    if (!target) {
      throw new SurfaceError("nothing is loaded; call surface_feedback_open first");
    }
    return target;
  }

  #background(work: Promise<void>): void {
    // oxlint-disable-next-line no-console -- background work records its own failures in state; this catches only bugs, which nothing else would surface
    this.idle = Promise.all([this.idle, work.catch((error) => console.error(error))]).then(() => undefined);
  }

  status(): string | undefined {
    const s = this.state;
    if (!s.target) {
      return undefined;
    }
    const visible = s.items.filter((i) => !i.hidden);
    const undecided = visible.filter((i) => i.decision === "undecided" && !i.closed).length;
    const drafts = visible.filter((i) => i.reply && i.reply.status !== "posted").length;
    return [s.pr ? `pr #${s.pr.number}` : "local", `${undecided} undecided`, `${drafts} draft${drafts === 1 ? "" : "s"}`].join(" · ");
  }

  url(): Promise<string> {
    return this.#ctx.url();
  }

  async #load(input: OpenInput): Promise<string | undefined> {
    const revision = (this.state.target?.revision ?? 0) + 1;
    const runner = this.#ctx.runner;
    const { target, pr, warning } = await loadTarget(runner, input, this.#now(), revision);
    const kept = this.state.target?.worktree === target.worktree && (this.state.pr?.url ?? null) === (pr?.url ?? null);
    const since = kept ? this.state.target!.since : target.since;
    const text = await feedbackDiff(runner, { ...target, since });
    const incoming = pr ? await listFeedback(runner, target, pr) : [];
    this.#diff = { revision, text };
    this.#commit(loadFeedback(this.state, target, pr, parseDiffFiles(text), incoming));
    await this.#syncPushed(this.state.pr?.headSha);
    return warning;
  }

  /** Marks committed plans as pushed once the given ref contains them. */
  async #syncPushed(ref: string | undefined): Promise<void> {
    if (!ref) {
      return;
    }
    const unpushed = this.state.commits.flatMap((c) => (c.sha && !c.pushed ? [c.sha] : []));
    if (!unpushed.length) {
      return;
    }
    this.#commit(markPushed(this.state, await containedIn(this.#ctx.runner, this.#target(), unpushed, ref)));
  }

  /** Loads a PR or local work, starts triage for items without an analysis, and returns the page URL. */
  async open(input: OpenInput): Promise<Opened> {
    const warning = await this.#load(input);
    const url = await this.url();
    const ids = untriaged(this.state);
    if (!ids.length || this.state.triage.status === "running") {
      return { url, warning };
    }
    this.#commit(startTask(this.state, "triage", this.#now()));
    return { url, warning, triage: triageBrief(this.state, ids) };
  }

  /** Re-reads the working tree and, with a PR, GitHub's feedback and head. */
  async refresh(): Promise<void> {
    const { target, pr } = this.state;
    if (!target) {
      throw new SurfaceError("nothing is loaded");
    }
    await this.#load({ worktree: target.worktree, ...(pr ? { pr: pr.url } : { base: target.baseRef }) });
  }

  async readDiff(): Promise<string> {
    const target = this.#target();
    if (this.#diff?.revision === target.revision) {
      return this.#diff.text;
    }
    // After a resume nothing is cached and the worktree may have moved on.
    await this.refresh();
    return this.#diff!.text;
  }

  setTaskStatus(task: TaskName, status: "running" | "failed", note: string): void {
    this.#commit(setTaskStatus(this.state, task, status, note, this.#now()));
  }

  postAnalyses(inputs: AnalysisInput[], final: boolean): void {
    this.#commit(postAnalyses(this.state, inputs, final, this.#now()));
  }

  addChatItems(inputs: ChatItemInput[]): string[] {
    const { ops, ids } = addChatItems(this.state, inputs, this.#now());
    this.#commit(ops);
    return ids;
  }

  /** Adds chat items and marks triage running for them; returns the ids and the triage request. */
  addChatItemsForTriage(inputs: ChatItemInput[]): ChatTriage {
    const ids = this.addChatItems(inputs);
    if (this.state.triage.status !== "running") {
      this.#commit(startTask(this.state, "triage", this.#now()));
    }
    return { ids, triage: triageBrief(this.state, ids) };
  }

  answer(itemId: string, text: string, visuals: LabeledVisual[] = []): void {
    this.#commit(addDiscussion(this.state, itemId, { role: "agent", text, at: this.#now() }, visuals));
  }

  /** Refreshes the files the agent just edited, then records its outcome for each fix. */
  async updateFixes(updates: FixUpdate[]): Promise<void> {
    // Validate first, so a bad update leaves the page as it was.
    updateFixes(this.state, updates, this.#now());
    await this.refresh();
    this.#commit(updateFixes(this.state, updates, this.#now()));
  }

  proposeCommits(inputs: CommitInput[]): void {
    this.#commit(proposeCommits(this.state, inputs, this.#now()));
  }

  /** Writes or revises an item's reply draft. Never posts. */
  draftReply(itemId: string, body: string, note?: string): void {
    itemOf(this.state, itemId);
    this.#commit(writeReply(this.state, itemId, body, this.#now(), { assisting: false, agentNote: note }));
  }

  async handleAction(action: PageAction): Promise<void> {
    const { ops, message, effect } = resolveAction(this.state, action, this.#now());
    this.#commit(ops);
    if (message) {
      this.#ctx.notifyAgent(message.content, message.details);
    }
    switch (effect?.kind) {
      case "post":
        this.#background(this.#post(effect.itemId, effect.resolve));
        break;
      case "commit":
        this.#background(this.#commitPlan(effect.commitId));
        break;
      case "push":
        this.#background(this.#push());
        break;
      case "resolve":
        await this.#resolve(effect.itemId);
        break;
      case "refresh":
        try {
          await this.refresh();
        } catch (error) {
          throw new SurfaceError(`refresh failed: ${messageOf(error)}`);
        }
        break;
    }
  }

  async #post(itemId: string, resolve: boolean): Promise<void> {
    const state = this.state;
    const item = itemOf(state, itemId);
    const source = item.source.kind === "thread" ? { kind: "thread", rootId: item.source.rootId } : { kind: item.source.kind };
    let posted: PostedReply;
    try {
      posted = await postReply(this.#ctx.runner, this.#target(), state.pr!, source, postedBody(item, item.reply!.body));
    } catch (error) {
      this.#commit(finishPosting(this.state, itemId, { error: messageOf(error) }, this.#now()));
      return;
    }
    let resolveError: string | undefined;
    if (resolve) {
      try {
        await resolveReviewThread(this.#ctx.runner, this.#target(), resolvableThread(this.state, itemId));
      } catch (error) {
        resolveError = messageOf(error);
      }
    }
    this.#commit(finishPosting(this.state, itemId, { ...posted, resolved: resolve && !resolveError, resolveError }, this.#now()));
  }

  async #resolve(itemId: string): Promise<void> {
    const threadId = resolvableThread(this.state, itemId);
    try {
      await resolveReviewThread(this.#ctx.runner, this.#target(), threadId);
    } catch (error) {
      throw new SurfaceError(`GitHub did not resolve the thread: ${messageOf(error)}`);
    }
    this.#commit(markResolved(this.state, itemId));
  }

  async #commitPlan(commitId: string): Promise<void> {
    const plan = commitOf(this.state, commitId);
    try {
      const sha = await commitPaths(this.#ctx.runner, this.#target(), plan.message, plan.paths);
      this.#commit(finishCommit(this.state, commitId, { sha }));
    } catch (error) {
      this.#commit(finishCommit(this.state, commitId, { error: messageOf(error) }));
      return;
    }
    await this.refresh().catch(() => undefined);
  }

  async #push(): Promise<void> {
    try {
      await push(this.#ctx.runner, this.#target());
    } catch (error) {
      this.#commit(finishPush(messageOf(error)));
      return;
    }
    this.#commit(finishPush());
    await this.#syncPushed("@{upstream}").catch(() => undefined);
    // GitHub's PR head can lag a push by a moment; the upstream check above already covers it.
    await this.refresh().catch(() => undefined);
  }
}
