import type { PatchOp } from "../../../src/host/patch.ts";
import { add, append, at, child, item, remove, replace, type Ptr } from "../../../src/host/ptr.ts";
import { messageOf, SurfaceError } from "../../../src/host/workflow.ts";
import { anchorOf, checkPath, checkRef, type CodeRef, type LabeledVisual, type Side, validateVisual } from "../../../src/kit/code.ts";
import type { CommitPlan } from "../../../src/kit/commits.ts";
import type { PrFile, PrInfo, Revisions } from "../../../src/kit/git.ts";
import * as drafts from "../../../src/kit/github-draft.ts";
import type { GitHubDraft } from "../../../src/kit/github-draft.ts";
import { LEVELS, type Level } from "../../../src/kit/levels.ts";
import * as rounds from "../../../src/kit/rounds.ts";
import type { RoundUpdate, RoundWork } from "../../../src/kit/rounds.ts";
import * as tasks from "../../../src/kit/task.ts";
import type { Task } from "../../../src/kit/task.ts";
import type { ThreadMessage } from "../../../src/kit/thread.ts";

/** The checkout the page works in. It is always the user's own working tree. */
export interface Target {
  worktree: string;
  /** The ref the merge base came from, e.g. the PR's base branch. */
  baseRef: string;
  mergeBase: string;
  /** HEAD at the last refresh. */
  head: string;
  /** Empty when HEAD is detached. */
  branch: string;
  title: string;
  /**
   * The commit the Changes tab compares the working tree against: the PR
   * head when the page first opened, or HEAD for local work without a PR.
   */
  since: string;
  /** Bumps on every refresh so the page reloads diffs. */
  revision: number;
  loadedAt: string;
}

export interface FeedbackPr extends PrInfo {
  /** The gh user posting replies; their own comments are not feedback. */
  viewer: string;
}

/** Where an inline review thread sits. Outdated threads have no current line. */
export interface ThreadAnchor {
  path: string;
  side: Side;
  /** On the PR head for RIGHT, the merge base for LEFT; null when outdated. */
  line: number | null;
  startLine?: number;
  originalLine?: number;
  /** GitHub's hunk at the time of the comment, so the code shows as the reviewer saw it. */
  diffHunk?: string;
}

export type FeedbackSource =
  | { kind: "thread"; rootId: number; threadId?: string; resolved: boolean; outdated: boolean }
  | { kind: "review"; reviewId: number; state: string }
  | { kind: "conversation"; commentId: number }
  | { kind: "chat" };

export type SourceKind = FeedbackSource["kind"];

/** One message as it reads on GitHub, or the text the user pasted in chat. */
export interface SourceMessage {
  author: string;
  body: string;
  createdAt: string;
  url?: string;
  /** Written by the viewer: an earlier reply or promise. */
  mine: boolean;
}

export type Decision = "undecided" | "fix" | "respond" | "skip";
export type Recommendation = Exclude<Decision, "undecided">;

export interface AnalysisInput {
  itemId: string;
  /** What the reviewer is asking for, in plain words. */
  meaning: string;
  recommendation: Recommendation;
  rationale: string;
  /** The risk introduced by making the change, not the risk of ignoring it. */
  risk: Level;
  importance: Level;
  rework: Level;
  /** The viewer already replied committing to a specific fix. */
  promised: boolean;
  promisedFix?: string;
  nextStep?: string;
  refs?: CodeRef[];
  visuals?: LabeledVisual[];
}

export interface Analysis extends Omit<AnalysisInput, "itemId" | "refs" | "visuals"> {
  refs: CodeRef[];
  visuals: LabeledVisual[];
  at: string;
}

/** The work the agent does for an item the user chose to fix. */
export interface Fix extends RoundWork {
  /** Files the agent reported changing, for commit proposals. */
  files: string[];
}

export type Reply = GitHubDraft;

export interface FeedbackItem {
  id: string;
  source: FeedbackSource;
  author: string;
  url?: string;
  anchor?: ThreadAnchor;
  /** The root comment first, then replies, oldest first. */
  messages: SourceMessage[];
  createdAt: string;
  analysis?: Analysis;
  decision: Decision;
  fix?: Fix;
  /** The user's questions to the agent about this item, and its answers. */
  discussion: ThreadMessage[];
  discussionVisuals: LabeledVisual[];
  reply?: Reply;
  /** Questions about the reply and the agent's answers; absent until the first question. */
  replyThread?: ThreadMessage[];
  /** Bots' conversation comments start hidden; the user can show any item. */
  hidden: boolean;
  /** The user marked the item finished without posting a reply. */
  closed: boolean;
}

export interface FeedbackState {
  version: 1;
  target: Target | null;
  pr: FeedbackPr | null;
  files: PrFile[];
  items: FeedbackItem[];
  commits: CommitPlan[];
  triage: Task;
  /** The agent is grouping fixed items into commit proposals. */
  proposing: Task;
  push: { status: "idle" | "pushing" | "failed"; error?: string };
  nextItemId: number;
  nextCommitId: number;
  fixRound: number;
}

export function emptyState(): FeedbackState {
  return {
    version: 1,
    target: null,
    pr: null,
    files: [],
    items: [],
    commits: [],
    triage: { status: "idle" },
    proposing: { status: "idle" },
    push: { status: "idle" },
    nextItemId: 1,
    nextCommitId: 1,
    fixRound: 0,
  };
}

const f = at<FeedbackState>();
const MAX_TEXT = 20_000;
const RECOMMENDATIONS: Recommendation[] = ["fix", "respond", "skip"];

/** The revisions the page reads: the merge base, the PR head, the Changes tab's base, and the working tree. */
export function revisions(target: Target, pr: FeedbackPr | null): Revisions {
  return { worktree: target.worktree, base: target.mergeBase, head: pr?.headSha ?? target.since, since: target.since, work: true };
}

export function requireTarget(state: FeedbackState): Target {
  if (!state.target) {
    throw new SurfaceError("nothing is loaded; call surface_feedback_open first");
  }
  return state.target;
}

function checkText(text: string, what: string): void {
  if (!text.trim()) {
    throw new SurfaceError(`${what} needs text`);
  }
  if (text.length > MAX_TEXT) {
    throw new SurfaceError(`${what} is limited to ${MAX_TEXT} characters`);
  }
}

function itemIndex(state: FeedbackState, id: string): number {
  const index = state.items.findIndex((i) => i.id === id);
  if (index < 0) {
    throw new SurfaceError(`unknown feedback item "${id}"`);
  }
  return index;
}

export function itemOf(state: FeedbackState, id: string): FeedbackItem {
  return state.items[itemIndex(state, id)];
}

const itemPtr = (state: FeedbackState, id: string) => f("items", itemIndex(state, id));

type ThreadSource = Extract<FeedbackSource, { kind: "thread" }>;
/** The item's source as a review thread; callers check the kind first. */
function threadSource(p: Ptr<FeedbackState, FeedbackItem>): Ptr<FeedbackState, ThreadSource> {
  // SAFETY: every caller has checked that this item's source.kind is "thread".
  return child(p, "source") as Ptr<FeedbackState, ThreadSource>;
}

function commitIndex(state: FeedbackState, id: string): number {
  const index = state.commits.findIndex((c) => c.id === id);
  if (index < 0) {
    throw new SurfaceError(`unknown commit proposal "${id}"`);
  }
  return index;
}

export function commitOf(state: FeedbackState, id: string): CommitPlan {
  return state.commits[commitIndex(state, id)];
}

/** The GitHub identity of an item's source, used to match items across refreshes. */
export function sourceKey(source: FeedbackSource): string | undefined {
  switch (source.kind) {
    case "thread":
      return `thread:${source.rootId}`;
    case "review":
      return `review:${source.reviewId}`;
    case "conversation":
      return `conversation:${source.commentId}`;
    case "chat":
      return undefined;
  }
}

/** What GitHub currently holds for one item; the session builds these from gh output. */
export interface IncomingItem {
  source: FeedbackSource;
  author: string;
  url?: string;
  anchor?: ThreadAnchor;
  messages: SourceMessage[];
  createdAt: string;
  hidden?: boolean;
}

function newItem(id: string, input: IncomingItem): FeedbackItem {
  const entry: FeedbackItem = {
    id,
    source: structuredClone(input.source),
    author: input.author,
    messages: structuredClone(input.messages),
    createdAt: input.createdAt,
    decision: "undecided",
    discussion: [],
    discussionVisuals: [],
    hidden: input.hidden ?? false,
    closed: false,
  };
  if (input.url) {
    entry.url = input.url;
  }
  if (input.anchor) {
    entry.anchor = structuredClone(input.anchor);
  }
  return entry;
}

/**
 * Ops that show a loaded PR or worktree. Loading a different worktree or PR
 * starts over. Reloading the same one keeps every item's analysis, decision,
 * fix and reply, refreshes what GitHub says, and adds items for new feedback.
 */
export function loadFeedback(state: FeedbackState, target: Target, pr: FeedbackPr | null, files: PrFile[], incoming: IncomingItem[]): PatchOp[] {
  const same = state.target?.worktree === target.worktree && (state.pr?.url ?? null) === (pr?.url ?? null);
  const base = same ? state : emptyState();
  const kept: Target = same && state.target ? { ...target, since: state.target.since } : target;
  const ops = [replace(f("target"), kept), replace(f("pr"), pr), replace(f("files"), files)];
  if (!same) {
    const fresh = emptyState();
    ops.push(
      replace(f("items"), fresh.items),
      replace(f("commits"), fresh.commits),
      replace(f("triage"), fresh.triage),
      replace(f("proposing"), fresh.proposing),
      replace(f("push"), fresh.push),
      replace(f("nextItemId"), fresh.nextItemId),
      replace(f("nextCommitId"), fresh.nextCommitId),
      replace(f("fixRound"), fresh.fixRound),
    );
  }
  const byKey = new Map(
    base.items.flatMap((entry, index) => {
      const key = sourceKey(entry.source);
      return key ? [[key, index] as const] : [];
    }),
  );
  let next = base.nextItemId;
  for (const input of incoming) {
    const key = sourceKey(input.source);
    const index = key === undefined ? undefined : byKey.get(key);
    if (index === undefined) {
      ops.push(append(f("items"), newItem(`PF-${next++}`, input)));
      continue;
    }
    ops.push(replace(f("items", index, "source"), structuredClone(input.source)), replace(f("items", index, "messages"), structuredClone(input.messages)));
    if (input.anchor) {
      ops.push(add(f("items", index, "anchor"), structuredClone(input.anchor)));
    }
  }
  ops.push(replace(f("nextItemId"), next));
  return ops;
}

/** The ids of visible items that have no analysis yet. */
export function untriaged(state: FeedbackState): string[] {
  return state.items.filter((i) => !i.hidden && !i.analysis).map((i) => i.id);
}

export interface ChatItemInput {
  body: string;
  author?: string;
  ref?: CodeRef;
}

/** Ops that add feedback the user pasted in chat; returns the new ids. */
/** Ops that add items, and the ids they get. */
export interface AddedItems {
  ops: PatchOp[];
  ids: string[];
}

export function addChatItems(state: FeedbackState, inputs: ChatItemInput[], now: string): AddedItems {
  requireTarget(state);
  if (!inputs.length) {
    throw new SurfaceError("add at least one item");
  }
  const errors: string[] = [];
  inputs.forEach((input, i) => {
    try {
      checkText(input.body, `item ${i + 1}`);
      if (input.ref) {
        checkRef(input.ref, `item ${i + 1} ref`);
      }
    } catch (error) {
      errors.push(messageOf(error));
    }
  });
  if (errors.length) {
    throw new SurfaceError(`invalid items:\n- ${errors.join("\n- ")}`);
  }
  const ids: string[] = [];
  const ops = inputs.map((input, i) => {
    const id = `PF-${state.nextItemId + i}`;
    ids.push(id);
    const author = input.author?.trim() || "chat";
    const incoming: IncomingItem = { source: { kind: "chat" }, author, messages: [{ author, body: input.body.trim(), createdAt: now, mine: false }], createdAt: now };
    if (input.ref) {
      incoming.anchor = anchorOf(input.ref);
    }
    return append(f("items"), newItem(id, incoming));
  });
  ops.push(replace(f("nextItemId"), state.nextItemId + inputs.length));
  return { ops, ids };
}

export type TaskName = "triage" | "proposing";

/** Ops that mark triage or a commit proposal as requested, keeping earlier results on show. */
export function startTask(state: FeedbackState, task: TaskName, now: string): PatchOp[] {
  requireTarget(state);
  return tasks.startTask(f(task), state[task], undefined, now, task === "triage" ? "triage is already running" : "the agent is already proposing commits");
}

const TASK_LABEL = { triage: "triage", proposing: "the commit proposal" } satisfies Record<TaskName, string>;

/** Ops for the agent's progress note, or a failure, on triage or a commit proposal the page started. */
export function setTaskStatus(state: FeedbackState, task: TaskName, status: "running" | "failed", note: string, now: string): PatchOp[] {
  requireTarget(state);
  return tasks.setTaskStatus(f(task), state[task], status, note, now, TASK_LABEL[task]);
}

/** Ops that end running triage or a commit proposal from the page. */
export function stopTask(state: FeedbackState, task: TaskName, now: string): PatchOp[] {
  return tasks.stopTask(f(task), state[task], now, TASK_LABEL[task]);
}

function validateAnalysis(state: FeedbackState, input: AnalysisInput, what: string): string[] {
  const errors: string[] = [];
  if (!state.items.some((i) => i.id === input.itemId)) {
    errors.push(`${what}: unknown feedback item "${input.itemId}"`);
  }
  if (!input.meaning?.trim()) {
    errors.push(`${what}: needs meaning`);
  }
  if (!input.rationale?.trim()) {
    errors.push(`${what}: needs a rationale`);
  }
  if (!RECOMMENDATIONS.includes(input.recommendation)) {
    errors.push(`${what}: recommendation must be fix, respond or skip`);
  }
  for (const key of ["risk", "importance", "rework"] as const) {
    if (!LEVELS.includes(input[key])) {
      errors.push(`${what}: ${key} must be Low, Medium or High`);
    }
  }
  for (const [i, ref] of (input.refs ?? []).entries()) {
    try {
      checkRef(ref, `${what} refs[${i}]`);
    } catch (error) {
      errors.push(messageOf(error));
    }
  }
  (input.visuals ?? []).forEach((v, i) => errors.push(...validateVisual(v, `${what} visual[${i}]`, { label: true })));
  return errors;
}

const newFix = (text: string, now: string): Fix => ({ ...rounds.newRoundWork(text, now), files: [] });

/**
 * Ops that record the agent's analysis of some items. An undecided item the
 * user already promised to fix is queued as a pending fix, which still waits
 * for the user to send it.
 */
export function postAnalyses(state: FeedbackState, inputs: AnalysisInput[], final: boolean, now: string): PatchOp[] {
  requireTarget(state);
  if (!inputs.length) {
    throw new SurfaceError("post at least one analysis");
  }
  const errors = inputs.flatMap((a, i) => validateAnalysis(state, a, `analysis ${i + 1} (${a.itemId})`));
  if (errors.length) {
    throw new SurfaceError(`invalid analyses:\n- ${errors.join("\n- ")}`);
  }
  const ops: PatchOp[] = [];
  for (const input of inputs) {
    const { itemId, refs, visuals, ...rest } = structuredClone(input);
    const p = itemPtr(state, itemId);
    const current = itemOf(state, itemId);
    ops.push(add(child(p, "analysis"), { ...rest, refs: refs ?? [], visuals: visuals ?? [], at: now }));
    if (input.promised && current.decision === "undecided") {
      const instruction = input.promisedFix?.trim() || input.nextStep?.trim() || "Make the fix you already promised the reviewer.";
      ops.push(replace(child(p, "decision"), "fix"), add(child(p, "fix"), newFix(instruction, now)));
    }
  }
  if (final) {
    ops.push(...tasks.finishTask(f("triage"), state.triage, now));
  }
  return ops;
}

function defaultInstruction(entry: FeedbackItem): string {
  return entry.analysis?.nextStep?.trim() || "Make the change the reviewer asked for.";
}

/**
 * Ops that record the user's decision. Choosing fix queues a pending fix with
 * the given instructions; leaving fix drops a fix the agent has not started.
 */
export function decide(state: FeedbackState, id: string, decision: Decision, instruction: string | undefined, now: string): PatchOp[] {
  const p = itemPtr(state, id);
  const entry = itemOf(state, id);
  if (!["undecided", "fix", "respond", "skip"].includes(decision)) {
    throw new SurfaceError("decision must be undecided, fix, respond or skip");
  }
  if (entry.fix?.status === "sent") {
    throw new SurfaceError(`${id}'s fix is with the agent; recall the batch before changing the decision`);
  }
  const ops = [replace(child(p, "decision"), decision)];
  if (decision === "fix") {
    const text = instruction?.trim() || defaultInstruction(entry);
    checkText(text, "a fix instruction");
    if (!entry.fix) {
      ops.push(add(child(p, "fix"), newFix(text, now)));
    } else if (entry.fix.status === "pending") {
      ops.push(...rounds.editRoundText(child(p, "fix"), entry.fix, text, `${id}'s fix`));
    } else if (instruction?.trim()) {
      ops.push(...followUpFix(state, id, text, now));
    }
  } else if (entry.fix && entry.fix.status === "pending" && entry.fix.messages.length === 1) {
    ops.push(remove(child(p, "fix")));
  }
  return ops;
}

/** Ops that rewrite a pending fix's instructions; they are always the last user message. */
export function editFix(state: FeedbackState, id: string, text: string): PatchOp[] {
  const fix = itemOf(state, id).fix;
  if (!fix || fix.status !== "pending") {
    throw new SurfaceError(`${id} has no pending fix to edit`);
  }
  checkText(text, "a fix instruction");
  return rounds.editRoundText(child(itemPtr(state, id), "fix"), fix, text, `${id}'s fix`);
}

/** Ops that answer the agent's fix outcome, putting the fix back in the next batch. */
export function followUpFix(state: FeedbackState, id: string, text: string, now: string): PatchOp[] {
  const fix = itemOf(state, id).fix;
  if (!fix) {
    throw new SurfaceError(`${id} has no fix`);
  }
  checkText(text, "a follow-up");
  return rounds.followUpRound(child(itemPtr(state, id), "fix"), fix, text, now, `${id}'s fix`);
}

/** Ops that send every pending fix as one round; returns the items sent. */
export function sendFixes(state: FeedbackState): rounds.SentRound {
  requireTarget(state);
  if (state.items.some((i) => i.fix?.status === "sent")) {
    throw new SurfaceError("the agent is still working on the last batch");
  }
  const pending = state.items.flatMap((entry, index) => (entry.fix?.status === "pending" ? [index] : []));
  if (!pending.length) {
    throw new SurfaceError("there are no pending fixes to send");
  }
  const round = state.fixRound + 1;
  return {
    ops: [replace(f("fixRound"), round), ...rounds.sendRound(pending.map((index) => child(item(f("items"), index), "fix")), round)],
    round,
    ids: pending.map((index) => state.items[index].id),
  };
}

/** Ops that take an unanswered batch back, so it can be edited and sent again. */
export function recallFixes(state: FeedbackState): PatchOp[] {
  return rounds.recallRound(state.items.flatMap((entry, index) => (entry.fix ? [{ p: f("items", index, "fix"), work: entry.fix }] : [])));
}

export interface FixUpdate extends RoundUpdate {
  itemId: string;
  files?: string[];
}

/** Ops that record the agent's outcome for each fix it was sent. */
export function updateFixes(state: FeedbackState, updates: FixUpdate[], now: string): PatchOp[] {
  requireTarget(state);
  const errors: string[] = [];
  const ops: PatchOp[] = [];
  for (const u of updates) {
    const index = state.items.findIndex((i) => i.id === u.itemId);
    const fix = state.items[index]?.fix;
    if (index < 0 || !fix) {
      errors.push(`${u.itemId}: no fix was sent for this item`);
      continue;
    }
    errors.push(...rounds.checkUpdate(u, u.itemId));
    for (const path of u.files ?? []) {
      try {
        checkPath(path, `${u.itemId} files`);
      } catch (error) {
        errors.push(messageOf(error));
      }
    }
    const p = f("items", index, "fix");
    ops.push(...rounds.updateRound(p, { status: u.status, reply: u.reply ?? "" }, now), replace(child(p, "files"), [...new Set([...fix.files, ...(u.files ?? [])])]));
  }
  if (errors.length) {
    throw new SurfaceError(`invalid fix updates:\n- ${errors.join("\n- ")}`);
  }
  return ops;
}

/** Ops that add a question or answer about an item's reply; the reply itself never changes. */
export function addReplyMessage(state: FeedbackState, id: string, message: ThreadMessage): PatchOp[] {
  const entry = itemOf(state, id);
  if (!entry.reply) {
    throw new SurfaceError(`${id} has no reply to ask about`);
  }
  checkText(message.text, message.role === "user" ? "a question" : "an answer");
  const p = child(itemPtr(state, id), "replyThread");
  const next = { ...message, text: message.text.trim() };
  return [entry.replyThread ? append(p, next) : add(p, [next])];
}

/** Ops that add a message to an item's discussion with the agent, with any visuals the agent attached. */
export function addDiscussion(state: FeedbackState, id: string, message: ThreadMessage, visuals: LabeledVisual[] = []): PatchOp[] {
  const p = itemPtr(state, id);
  checkText(message.text, message.role === "user" ? "a question" : "an answer");
  const errors = visuals.flatMap((v, i) => validateVisual(v, `visual[${i}]`, { label: true }));
  if (errors.length) {
    throw new SurfaceError(`invalid visuals:\n- ${errors.join("\n- ")}`);
  }
  return [append(child(p, "discussion"), { ...message, text: message.text.trim() }), ...visuals.map((v) => append(child(p, "discussionVisuals"), structuredClone(v)))];
}

const replyLabel = (id: string) => `${id}'s reply`;

/**
 * Ops that set an item's reply body, creating the reply if needed. A body may
 * be empty only while the agent writes it.
 */
export function writeReply(state: FeedbackState, id: string, body: string, now: string, options: { assisting?: boolean; agentNote?: string } = {}): PatchOp[] {
  const entry = itemOf(state, id);
  if (entry.reply) {
    drafts.checkEditable(entry.reply, replyLabel(id));
  }
  if (!options.assisting) {
    checkText(body, "a reply");
  }
  return [add(child(itemPtr(state, id), "reply"), drafts.newDraft(body, now, options))];
}

/** Ops that mark the agent as writing an item's reply, keeping any current draft on show. */
export function setAssisting(state: FeedbackState, id: string, assisting: boolean, now: string): PatchOp[] {
  const entry = itemOf(state, id);
  if (!entry.reply) {
    return assisting ? writeReply(state, id, "", now, { assisting: true }) : [];
  }
  return drafts.setAssisting(child(itemPtr(state, id), "reply"), entry.reply, assisting, replyLabel(id));
}

export function deleteReply(state: FeedbackState, id: string): PatchOp[] {
  const entry = itemOf(state, id);
  if (!entry.reply) {
    return [];
  }
  drafts.checkEditable(entry.reply, replyLabel(id));
  return [remove(child(itemPtr(state, id), "reply"))];
}

/** The commit an item's fix landed in, when there is one. */
export function commitFor(state: FeedbackState, itemId: string): CommitPlan | undefined {
  return state.commits.find((c) => c.status === "committed" && c.items.includes(itemId));
}

/** Why a reply cannot be posted right now, or undefined when it can. */
export function postBlocker(state: FeedbackState, entry: FeedbackItem): string | undefined {
  if (!state.pr) {
    return "posting needs a PR";
  }
  if (entry.source.kind === "chat") {
    return "feedback from chat has no GitHub thread; copy the reply instead";
  }
  if (!entry.reply?.body.trim()) {
    return "the reply is empty";
  }
  if (entry.reply.assisting) {
    return "the agent is still writing this reply";
  }
  if (entry.reply.status === "posted" || entry.reply.status === "posting") {
    return `the reply is already ${entry.reply.status}`;
  }
  const commit = commitFor(state, entry.id);
  if (commit && !commit.pushed) {
    return `commit ${commit.sha?.slice(0, 8)} is not on GitHub yet; push before replying`;
  }
  return undefined;
}

/**
 * The text that reaches GitHub. Replies in a review thread stay as written;
 * a reply to a review summary or PR comment quotes it, since GitHub cannot
 * thread replies under those.
 */
export function postedBody(entry: FeedbackItem, body: string): string {
  if (entry.source.kind !== "review" && entry.source.kind !== "conversation") {
    return body;
  }
  const lines =
    entry.messages[0]?.body
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean) ?? [];
  const excerpt = lines.slice(0, 3).map((l) => `> ${l}`);
  if (lines.length > 3) {
    excerpt.push("> …");
  }
  return [`@${entry.author}`, ...excerpt, "", body].join("\n");
}

/** Ops that mark a reply as on its way to GitHub. */
export function startPosting(state: FeedbackState, id: string): PatchOp[] {
  const entry = itemOf(state, id);
  const blocker = postBlocker(state, entry);
  if (blocker) {
    throw new SurfaceError(`${id}: ${blocker}`);
  }
  return drafts.startPosting(child(itemPtr(state, id), "reply"), entry.reply!, replyLabel(id));
}

/** Ops that record a post's outcome. A resolved thread is recorded only when the resolve call succeeded. */
export function finishPosting(
  state: FeedbackState,
  id: string,
  result: { githubId: number; url: string; resolved?: boolean; resolveError?: string } | { error: string },
  now: string,
): PatchOp[] {
  const p = itemPtr(state, id);
  const ops = drafts.finishPosting(child(p, "reply"), "error" in result ? result : { githubId: result.githubId, url: result.url }, now);
  if ("error" in result) {
    return ops;
  }
  if (result.resolved) {
    ops.push(replace(child(threadSource(p), "resolved"), true));
  }
  if (result.resolveError) {
    ops.push(add(child(child(p, "reply"), "error"), `Posted, but the thread was not resolved: ${result.resolveError}`));
  }
  return ops;
}

/** The GraphQL id of a thread item that can still be resolved. */
export function resolvableThread(state: FeedbackState, id: string): string {
  const entry = itemOf(state, id);
  if (!state.pr) {
    throw new SurfaceError("resolving needs a PR");
  }
  if (entry.source.kind !== "thread") {
    throw new SurfaceError(`${id} is not a review thread; only threads can be resolved`);
  }
  if (entry.source.resolved) {
    throw new SurfaceError(`${id}'s thread is already resolved`);
  }
  if (!entry.source.threadId) {
    throw new SurfaceError(`GitHub did not return a thread id for ${id}; refresh and try again`);
  }
  return entry.source.threadId;
}

export function markResolved(state: FeedbackState, id: string): PatchOp[] {
  return [replace(child(threadSource(itemPtr(state, id)), "resolved"), true)];
}

export function setFlag(state: FeedbackState, id: string, flag: "hidden" | "closed", value: boolean): PatchOp[] {
  return [replace(child(itemPtr(state, id), flag), value)];
}

export interface CommitInput {
  message: string;
  items: string[];
  paths: string[];
}

function validateCommit(state: FeedbackState, input: CommitInput, what: string): string[] {
  const errors: string[] = [];
  if (!input.message?.trim()) {
    errors.push(`${what}: needs a message`);
  }
  if (!input.paths?.length) {
    errors.push(`${what}: needs at least one path`);
  }
  for (const path of input.paths ?? []) {
    try {
      checkPath(path, what);
    } catch (error) {
      errors.push(messageOf(error));
    }
  }
  for (const id of input.items ?? []) {
    if (!state.items.some((i) => i.id === id)) {
      errors.push(`${what}: unknown feedback item "${id}"`);
    }
  }
  return errors;
}

/** Ops that replace the open proposals with new ones; commits already made stay. */
export function proposeCommits(state: FeedbackState, inputs: CommitInput[], now: string): PatchOp[] {
  requireTarget(state);
  const errors = inputs.flatMap((c, i) => validateCommit(state, c, `commit ${i + 1}`));
  if (errors.length) {
    throw new SurfaceError(`invalid commits:\n- ${errors.join("\n- ")}`);
  }
  const kept = state.commits.filter((c) => c.status === "committed" || c.status === "committing");
  const plans: CommitPlan[] = inputs.map((c, i) => ({
    id: `K${state.nextCommitId + i}`,
    message: c.message.trim(),
    items: [...new Set(c.items ?? [])],
    paths: [...new Set(c.paths)],
    status: "proposed",
    pushed: false,
  }));
  return [replace(f("commits"), [...kept, ...plans]), replace(f("nextCommitId"), state.nextCommitId + inputs.length), ...tasks.finishTask(f("proposing"), state.proposing, now)];
}

function openPlan(state: FeedbackState, id: string): number {
  const index = commitIndex(state, id);
  const status = state.commits[index].status;
  if (status !== "proposed" && status !== "failed") {
    throw new SurfaceError(`${id} is ${status}; only proposals can change`);
  }
  return index;
}

export function editCommit(state: FeedbackState, id: string, input: CommitInput): PatchOp[] {
  const index = openPlan(state, id);
  const errors = validateCommit(state, input, id);
  if (errors.length) {
    throw new SurfaceError(errors.join("\n"));
  }
  return [
    replace(f("commits", index, "message"), input.message.trim()),
    replace(f("commits", index, "items"), [...new Set(input.items)]),
    replace(f("commits", index, "paths"), [...new Set(input.paths)]),
  ];
}

export function deleteCommit(state: FeedbackState, id: string): PatchOp[] {
  return [remove(f("commits", openPlan(state, id)))];
}

export function startCommit(state: FeedbackState, id: string): PatchOp[] {
  requireTarget(state);
  if (state.commits.some((c) => c.status === "committing")) {
    throw new SurfaceError("another commit is in progress");
  }
  const index = openPlan(state, id);
  const ops = [replace(f("commits", index, "status"), "committing")];
  if (state.commits[index].error !== undefined) {
    ops.push(remove(f("commits", index, "error")));
  }
  return ops;
}

export function finishCommit(state: FeedbackState, id: string, result: { sha: string } | { error: string }): PatchOp[] {
  const index = commitIndex(state, id);
  if ("error" in result) {
    return [replace(f("commits", index, "status"), "failed"), add(f("commits", index, "error"), result.error)];
  }
  return [replace(f("commits", index, "status"), "committed"), add(f("commits", index, "sha"), result.sha)];
}

/** Ops that mark the given commits as on GitHub. */
export function markPushed(state: FeedbackState, shas: Set<string>): PatchOp[] {
  return state.commits.flatMap((c, index) => (c.sha && !c.pushed && shas.has(c.sha) ? [replace(f("commits", index, "pushed"), true)] : []));
}

export function startPush(state: FeedbackState): PatchOp[] {
  requireTarget(state);
  if (state.push.status === "pushing") {
    throw new SurfaceError("a push is already running");
  }
  return [replace(f("push"), { status: "pushing" })];
}

export function finishPush(error?: string): PatchOp[] {
  return [replace(f("push"), error ? { status: "failed", error } : { status: "idle" })];
}
