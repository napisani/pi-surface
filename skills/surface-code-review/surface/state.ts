import type { Created, PatchOp } from "../../../src/host/patch.ts";
import { add, append, at, child, item, remove, replace } from "../../../src/host/ptr.ts";
import { messageOf, SurfaceError } from "../../../src/host/workflow.ts";
import { type Anchor, anchorOf, checkLines, checkPath, checkRef, checkSide, type CodeRef, type LabeledVisual, type Rev, type Side, validateVisual } from "../../../src/kit/code.ts";
import { FINDING_DIMENSIONS, FIX_SIZES, SEVERITIES, TRIAGE_BUCKETS, outsideFiles, type DroppedFinding, type Finding, type FindingInput, type ReviewSummary, type Triage } from "../../../src/kit/findings.ts";
import { availableRevs, type PrFile, type PrInfo, type Revisions } from "../../../src/kit/git.ts";
import * as drafts from "../../../src/kit/github-draft.ts";
import type { GitHubDraft, PostResult } from "../../../src/kit/github-draft.ts";
import { LEVELS } from "../../../src/kit/levels.ts";
import * as rounds from "../../../src/kit/rounds.ts";
import type { RoundUpdate, RoundWork } from "../../../src/kit/rounds.ts";
import * as tasks from "../../../src/kit/task.ts";
import type { Task } from "../../../src/kit/task.ts";
import type { ThreadMessage } from "../../../src/kit/thread.ts";
import type { TourStep, TourStepInput } from "../../../src/kit/tour.ts";

/** What the page compares: a merge base against a commit or the live working tree. */
export interface Target {
  worktree: string;
  /** live reads the working tree, so the agent can edit it; pinned reads one commit. */
  mode: "live" | "pinned";
  /** The ref the base came from, e.g. origin/main or the PR's base branch. */
  baseRef: string;
  mergeBase: string;
  /** The pinned commit, or HEAD at the last refresh of a live review. */
  head: string;
  /** Empty when HEAD is detached. */
  branch: string;
  title: string;
  /** Bumps on every refresh so the page reloads diffs. */
  revision: number;
  loadedAt: string;
}

/** GitHub's view of the PR, present only when the review has one. */
export interface ReviewPr extends PrInfo {
  /** Set by a refresh that found new commits on the PR. */
  remoteHeadSha?: string;
}

export type CommentOrigin = { kind: "manual" } | { kind: "finding"; findingId: string; findingTitle: string };

export interface DraftComment extends GitHubDraft {
  id: string;
  anchor: Anchor;
  origin: CommentOrigin;
  /** GitHub id of the comment this replies to. */
  inReplyTo?: number;
  createdAt: string;
}

/** A review comment already on GitHub. Outdated comments have no current line. */
export interface RemoteComment {
  id: number;
  inReplyTo?: number;
  path: string;
  side: Side;
  line: number | null;
  startLine?: number;
  originalLine?: number;
  body: string;
  author: string;
  url: string;
  createdAt: string;
}

/** A change the user asks the agent to make in a live review's working tree. */
export interface ChangeRequest extends RoundWork {
  id: string;
  /** Absent for a request about the change as a whole. */
  anchor?: Anchor;
  /** The anchored line's text when the request was made, so the agent can find it after edits. */
  anchorText?: string;
  /** The file's fingerprint when anchored; a different one now means lines may have moved. */
  fingerprint?: string;
  origin: CommentOrigin;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewRun extends Task {
  summary?: ReviewSummary;
  findings: Finding[];
  dropped: DroppedFinding[];
  disagreements: string[];
}

export interface Walkthrough extends Task {
  title?: string;
  summary?: string;
  steps: TourStep[];
}

/** A question the user asked the agent about some code or a walkthrough step. */
export interface QuestionThread {
  id: string;
  ref?: CodeRef;
  stepId?: string;
  /** Kept so the question still reads right after the walkthrough is regenerated. */
  stepTitle?: string;
  messages: ThreadMessage[];
  visuals: LabeledVisual[];
  resolved: boolean;
  createdAt: string;
}

export interface ReviewState {
  version: 1;
  target: Target | null;
  pr: ReviewPr | null;
  files: PrFile[];
  comments: DraftComment[];
  remote: RemoteComment[];
  requests: ChangeRequest[];
  review: ReviewRun;
  walkthrough: Walkthrough;
  questions: QuestionThread[];
  nextCommentId: number;
  nextRequestId: number;
  nextQuestionId: number;
  requestRound: number;
}

export type TaskKind = "review" | "walkthrough";

export function emptyState(): ReviewState {
  return {
    version: 1,
    target: null,
    pr: null,
    files: [],
    comments: [],
    remote: [],
    requests: [],
    review: { status: "idle", findings: [], dropped: [], disagreements: [] },
    walkthrough: { status: "idle", steps: [] },
    questions: [],
    nextCommentId: 1,
    nextRequestId: 1,
    nextQuestionId: 1,
    requestRound: 0,
  };
}

const r = at<ReviewState>();
const MAX_BODY = 20_000;

/** The revisions the page can read: the merge base, the head, and in a live review the working tree. */
export function revisions(target: Target): Revisions {
  return { worktree: target.worktree, base: target.mergeBase, head: target.head, work: target.mode === "live" };
}

/** The revision a diff side shows: a live review's right side is the working tree. */
export function sideRev(target: Target, side: Side): Rev {
  if (side === "LEFT") {
    return "base";
  }
  return target.mode === "live" ? "work" : "head";
}

function requireTarget(state: ReviewState): Target {
  if (!state.target) {
    throw new SurfaceError("nothing is loaded; call surface_review_open first");
  }
  return state.target;
}

function requirePr(state: ReviewState): PrInfo {
  requireTarget(state);
  if (!state.pr) {
    throw new SurfaceError("GitHub comments need a PR; this review has none");
  }
  return state.pr;
}

function requireLive(state: ReviewState): Target {
  const target = requireTarget(state);
  if (target.mode !== "live") {
    throw new SurfaceError("change requests need a live review of a working tree; this one is pinned to a commit");
  }
  return target;
}

function checkReviewRef(state: ReviewState, ref: CodeRef, what: string): void {
  checkRef(ref, what, availableRevs(revisions(requireTarget(state))));
}

/**
 * Checks that a comment can attach where asked: the file is in the PR and the
 * side exists for it. Whether the line sits inside a diff hunk is GitHub's
 * call; a 422 from the post shows on the comment.
 */
export function checkAnchor(state: ReviewState, anchor: Anchor): void {
  const file = state.files.find((f) => f.path === anchor.path);
  if (!file) {
    throw new SurfaceError(`"${anchor.path}" is not in this diff; comments can only attach to changed files`);
  }
  checkSide(anchor.side, `comment on ${anchor.path}`);
  if (anchor.side === "LEFT" && file.status === "added") {
    throw new SurfaceError(`"${anchor.path}" is new in this PR; it has no LEFT side`);
  }
  if (anchor.side === "RIGHT" && file.status === "deleted") {
    throw new SurfaceError(`"${anchor.path}" is deleted in this PR; it has no RIGHT side`);
  }
  checkLines(anchor.startLine ?? anchor.line, anchor.line, `comment on ${anchor.path}`);
}

function commentIndex(state: ReviewState, id: string): number {
  const index = state.comments.findIndex((c) => c.id === id);
  if (index < 0) {
    throw new SurfaceError(`unknown comment "${id}"`);
  }
  return index;
}

function findingIndex(state: ReviewState, id: string): number {
  const index = state.review.findings.findIndex((f) => f.id === id);
  if (index < 0) {
    throw new SurfaceError(`unknown finding "${id}"`);
  }
  return index;
}

export function findingOf(state: ReviewState, id: string): Finding {
  return state.review.findings[findingIndex(state, id)];
}

export function commentOf(state: ReviewState, id: string): DraftComment {
  return state.comments[commentIndex(state, id)];
}

/**
 * Ops that show a loaded review. Loading a different worktree or PR starts the
 * page over; reloading the same one keeps comments, requests, findings and the walkthrough.
 */
export function loadReview(state: ReviewState, target: Target, pr: ReviewPr | null, files: PrFile[], remote: RemoteComment[]): PatchOp[] {
  const same = state.target?.worktree === target.worktree && (state.pr?.url ?? null) === (pr?.url ?? null);
  const ops = [replace(r("target"), target), replace(r("pr"), pr), replace(r("files"), files), replace(r("remote"), remote)];
  if (same) {
    return ops;
  }
  const fresh = emptyState();
  ops.push(
    replace(r("comments"), fresh.comments),
    replace(r("requests"), fresh.requests),
    replace(r("review"), fresh.review),
    replace(r("walkthrough"), fresh.walkthrough),
    replace(r("questions"), fresh.questions),
  );
  return ops;
}

/** Ops for a refresh: the latest files, and for a PR its threads and current head. */
export function refreshReview(state: ReviewState, target: Target, files: PrFile[], github?: { remote: RemoteComment[]; remoteHeadSha: string }): PatchOp[] {
  requireTarget(state);
  const ops = [replace(r("target"), target), replace(r("files"), files)];
  if (github && state.pr) {
    ops.push(replace(r("remote"), github.remote));
    if (github.remoteHeadSha !== state.pr.headSha) {
      ops.push(add(r("pr", "remoteHeadSha"), github.remoteHeadSha));
    } else if (state.pr.remoteHeadSha) {
      ops.push(remove(r("pr", "remoteHeadSha")));
    }
  }
  return ops;
}

export interface NewComment {
  anchor: Anchor;
  body: string;
  origin?: CommentOrigin;
  inReplyTo?: number;
  assisting?: boolean;
  agentNote?: string;
}

/** Ops that add a draft; returns the new id too. A body may be empty while the agent writes it. */
export function addComment(state: ReviewState, input: NewComment, now: string): Created {
  requirePr(state);
  checkAnchor(state, input.anchor);
  if (input.inReplyTo !== undefined && !state.remote.some((c) => c.id === input.inReplyTo)) {
    throw new SurfaceError(`no GitHub comment ${input.inReplyTo} to reply to`);
  }
  const id = `C${state.nextCommentId}`;
  const comment: DraftComment = {
    id,
    anchor: { ...input.anchor },
    ...drafts.newDraft(input.body, now, { assisting: input.assisting, agentNote: input.agentNote }),
    origin: input.origin ?? { kind: "manual" },
    createdAt: now,
  };
  if (input.inReplyTo !== undefined) {
    comment.inReplyTo = input.inReplyTo;
  }
  return { id, ops: [append(r("comments"), comment), replace(r("nextCommentId"), state.nextCommentId + 1)] };
}

const commentPtr = (state: ReviewState, id: string) => r("comments", commentIndex(state, id));

export function editComment(state: ReviewState, id: string, body: string, now: string, agentNote?: string): PatchOp[] {
  return drafts.editDraft(commentPtr(state, id), commentOf(state, id), body, now, `comment ${id}`, agentNote);
}

export function moveComment(state: ReviewState, id: string, anchor: Anchor, now: string): PatchOp[] {
  const p = commentPtr(state, id);
  drafts.checkEditable(commentOf(state, id), `comment ${id}`);
  checkAnchor(state, anchor);
  return [replace(child(p, "anchor"), { ...anchor }), replace(child(p, "updatedAt"), now)];
}

export function deleteComment(state: ReviewState, id: string): PatchOp[] {
  drafts.checkEditable(commentOf(state, id), `comment ${id}`);
  return [remove(commentPtr(state, id))];
}

export function setAssisting(state: ReviewState, id: string, assisting: boolean): PatchOp[] {
  return drafts.setAssisting(commentPtr(state, id), commentOf(state, id), assisting, `comment ${id}`);
}

/** Ops that mark a draft as on its way to GitHub. */
export function startPosting(state: ReviewState, id: string): PatchOp[] {
  requirePr(state);
  return drafts.startPosting(commentPtr(state, id), commentOf(state, id), `comment ${id}`);
}

/** Ops that record a post's outcome; a posted comment also joins the GitHub threads. */
export function finishPosting(state: ReviewState, id: string, result: RemoteComment | { error: string }, now: string): PatchOp[] {
  const outcome: PostResult = "error" in result ? result : { githubId: result.id, url: result.url };
  const ops = drafts.finishPosting(commentPtr(state, id), outcome, now);
  if (!("error" in result) && !state.remote.some((c) => c.id === result.id)) {
    ops.push(append(r("remote"), result));
  }
  return ops;
}

/** Ops that mark a review or walkthrough as requested, keeping the previous results on show. */
export function startTask(state: ReviewState, kind: TaskKind, focus: string | undefined, now: string): PatchOp[] {
  requireTarget(state);
  return tasks.startTask(r(kind), state[kind], focus, now, `a ${kind} is already running`);
}

/** Ops for the agent's progress note or failure on a review or walkthrough the page started. */
export function setTaskStatus(state: ReviewState, kind: TaskKind, status: "running" | "failed", note: string, now: string): PatchOp[] {
  requireTarget(state);
  return tasks.setTaskStatus(r(kind), state[kind], status, note, now, `the ${kind}`);
}

/** Ops that end a running review or walkthrough from the page. */
export function stopTask(state: ReviewState, kind: TaskKind, now: string): PatchOp[] {
  return tasks.stopTask(r(kind), state[kind], now, `the ${kind}`);
}

function validateFinding(state: ReviewState, input: FindingInput, what: string): string[] {
  const errors: string[] = [];
  if (!input.title?.trim()) {
    errors.push(`${what}: needs a title`);
  }
  if (!input.summary?.trim()) {
    errors.push(`${what}: needs a summary`);
  }
  if (!SEVERITIES.includes(input.severity)) {
    errors.push(`${what}: severity must be one of ${SEVERITIES.join(", ")}`);
  }
  if (!LEVELS.includes(input.confidence)) {
    errors.push(`${what}: confidence must be one of ${LEVELS.join(", ")}`);
  }
  for (const [i, ref] of [input.primary, ...(input.related ?? [])].entries()) {
    try {
      checkReviewRef(state, ref, `${what} ${i === 0 ? "primary" : `related[${i - 1}]`}`);
    } catch (error) {
      errors.push(messageOf(error));
    }
  }
  (input.visuals ?? []).forEach((v, i) => errors.push(...validateVisual(v, `${what} visual[${i}]`, { label: true })));
  errors.push(...validateTriage(state, input, what), ...validateScores(input, what));
  return errors;
}

function incompleteTriage(t: Triage, what: string): string[] {
  const errors: string[] = [];
  if (!TRIAGE_BUCKETS.includes(t.bucket)) {
    errors.push(`${what}: triage.bucket must be one of ${TRIAGE_BUCKETS.join(", ")}`);
  }
  if (!FIX_SIZES.includes(t.fixSize)) {
    errors.push(`${what}: triage.fixSize must be one of ${FIX_SIZES.join(", ")}`);
  }
  if (!t.touches?.length) {
    errors.push(`${what}: triage.touches needs the files the fix edits`);
  }
  if (!t.reason?.trim()) {
    errors.push(`${what}: triage needs a reason`);
  }
  return errors;
}

/** Holds a triage to the mvr-suggestions rules, so a bucket always means the same thing on the page. */
function validateTriage(state: ReviewState, input: FindingInput, what: string): string[] {
  const t = input.triage;
  if (!t) {
    return [`${what}: needs a triage`];
  }
  const missing = incompleteTriage(t, what);
  if (missing.length) {
    return missing;
  }
  const errors: string[] = [];
  const outside = outsideFiles(state.files, t.touches);
  const cheap = t.fixSize === "Trivial" || t.fixSize === "Small";
  if ((input.severity === "Critical" || input.severity === "High") && (t.bucket === "defer" || t.bucket === "skip")) {
    errors.push(`${what}: ${input.severity} findings are always fixed in this diff; use fix-now or fix-now-expands`);
  }
  if (t.bucket === "fix-now" && (!cheap || outside.length)) {
    errors.push(`${what}: fix-now needs a Trivial or Small fix inside the diff's files${outside.length ? ` (${outside.join(", ")} is outside)` : ""}; use fix-now-expands`);
  }
  if (t.bucket === "fix-now-expands" && cheap && !outside.length) {
    errors.push(`${what}: a ${t.fixSize} fix inside the diff's files is fix-now, not fix-now-expands`);
  }
  return errors;
}

function validateScores(input: FindingInput, what: string): string[] {
  if (!input.scores) {
    return [`${what}: needs scores for ${FINDING_DIMENSIONS.map((d) => d.id).join(", ")}`];
  }
  const errors: string[] = [];
  for (const d of FINDING_DIMENSIONS) {
    const score = input.scores[d.id];
    if (!score || !Number.isInteger(score.value) || score.value < 1 || score.value > 5) {
      errors.push(`${what}: scores.${d.id} needs a whole value from 1 to 5`);
    } else if (!score.why?.trim()) {
      errors.push(`${what}: scores.${d.id} needs a why`);
    }
  }
  const known = new Set(FINDING_DIMENSIONS.map((d) => d.id));
  for (const id of Object.keys(input.scores)) {
    if (!known.has(id)) {
      errors.push(`${what}: unknown score "${id}"`);
    }
  }
  return errors;
}

export interface FindingsInput {
  summary: ReviewSummary;
  findings: FindingInput[];
  dropped?: DroppedFinding[];
  disagreements?: string[];
}

/**
 * Ops that publish a review's results, numbering findings F1.. in the order
 * given. Comments drafted from earlier findings keep their own copy of the title.
 */
export function postFindings(state: ReviewState, input: FindingsInput, now: string): PatchOp[] {
  requireTarget(state);
  const errors = input.findings.flatMap((f, i) => validateFinding(state, f, `finding ${i + 1}`));
  if (!LEVELS.includes(input.summary?.risk)) {
    errors.push(`summary.risk must be Low, Medium or High`);
  }
  if (errors.length) {
    throw new SurfaceError(`invalid findings:\n- ${errors.join("\n- ")}`);
  }
  const findings: Finding[] = input.findings.map((f, i) => ({
    ...structuredClone(f),
    id: `F${i + 1}`,
    related: structuredClone(f.related ?? []),
    visuals: structuredClone(f.visuals ?? []),
    dismissed: false,
    thread: [],
  }));
  const review: ReviewRun = {
    ...tasks.finishedTask(state.review, now),
    summary: structuredClone(input.summary),
    findings,
    dropped: structuredClone(input.dropped ?? []),
    disagreements: structuredClone(input.disagreements ?? []),
  };
  return [replace(r("review"), review)];
}

export function dismissFinding(state: ReviewState, id: string, dismissed: boolean): PatchOp[] {
  return [replace(r("review", "findings", findingIndex(state, id), "dismissed"), dismissed)];
}

function checkVisuals(visuals: LabeledVisual[]): void {
  const errors = visuals.flatMap((v, i) => validateVisual(v, `visual[${i}]`, { label: true }));
  if (errors.length) {
    throw new SurfaceError(`invalid visuals:\n- ${errors.join("\n- ")}`);
  }
}

export function addFindingMessage(state: ReviewState, id: string, message: ThreadMessage, visuals: LabeledVisual[] = []): PatchOp[] {
  const p = r("review", "findings", findingIndex(state, id));
  checkVisuals(visuals);
  return [append(child(p, "thread"), message), ...visuals.map((v) => append(child(p, "visuals"), v))];
}

export interface WalkthroughInput {
  title: string;
  summary: string;
  steps: TourStepInput[];
}

export function postWalkthrough(state: ReviewState, input: WalkthroughInput, now: string): PatchOp[] {
  requireTarget(state);
  const errors: string[] = [];
  if (!input.steps?.length) {
    errors.push("a walkthrough needs at least one step");
  }
  input.steps?.forEach((step, i) => {
    const what = `step ${i + 1}`;
    if (!step.title?.trim()) {
      errors.push(`${what}: needs a title`);
    }
    if (!step.body?.trim()) {
      errors.push(`${what}: needs a body`);
    }
    try {
      checkReviewRef(state, step.ref, what);
    } catch (error) {
      errors.push(messageOf(error));
    }
    if (step.visual) {
      errors.push(...validateVisual(step.visual, what, { label: true }));
    }
  });
  if (errors.length) {
    throw new SurfaceError(`invalid walkthrough:\n- ${errors.join("\n- ")}`);
  }
  const walkthrough: Walkthrough = {
    ...tasks.finishedTask(state.walkthrough, now),
    title: input.title,
    summary: input.summary,
    steps: input.steps.map((s, i) => ({ ...structuredClone(s), id: `S${i + 1}` })),
  };
  // Step ids restart at S1, so questions about the old tour must let go of them.
  const detach = state.questions.flatMap((q, qi) => (q.stepId ? [remove(r("questions", qi, "stepId"))] : []));
  return [replace(r("walkthrough"), walkthrough), ...detach];
}

function questionIndex(state: ReviewState, id: string): number {
  const index = state.questions.findIndex((q) => q.id === id);
  if (index < 0) {
    throw new SurfaceError(`unknown question "${id}"`);
  }
  return index;
}

export function questionOf(state: ReviewState, id: string): QuestionThread {
  return state.questions[questionIndex(state, id)];
}

function checkText(text: string, what = "a question"): void {
  if (!text.trim()) {
    throw new SurfaceError(`${what} needs text`);
  }
  if (text.length > MAX_BODY) {
    throw new SurfaceError(`${what} is limited to ${MAX_BODY} characters`);
  }
}

/** Ops that open a question about some code, a walkthrough step, or the PR as a whole. */
export function askQuestion(state: ReviewState, input: { ref?: CodeRef; stepId?: string; text: string }, now: string): Created {
  requireTarget(state);
  checkText(input.text);
  const step = input.stepId ? state.walkthrough.steps.find((s) => s.id === input.stepId) : undefined;
  if (input.stepId && !step) {
    throw new SurfaceError(`unknown walkthrough step "${input.stepId}"`);
  }
  const ref = input.ref ?? step?.ref;
  if (ref) {
    checkReviewRef(state, ref, "question");
  }
  const id = `Q${state.nextQuestionId}`;
  const question: QuestionThread = { id, messages: [{ role: "user", text: input.text.trim(), at: now }], visuals: [], resolved: false, createdAt: now };
  if (ref) {
    question.ref = { ...ref };
  }
  if (step) {
    question.stepId = step.id;
    question.stepTitle = step.title;
  }
  return { id, ops: [append(r("questions"), question), replace(r("nextQuestionId"), state.nextQuestionId + 1)] };
}

export function addQuestionMessage(state: ReviewState, id: string, message: ThreadMessage, visuals: LabeledVisual[] = []): PatchOp[] {
  const qi = questionIndex(state, id);
  const p = r("questions", qi);
  checkText(message.text);
  checkVisuals(visuals);
  return [
    append(child(p, "messages"), message),
    ...visuals.map((v) => append(child(p, "visuals"), v)),
    ...(message.role === "user" && state.questions[qi].resolved ? [replace(child(p, "resolved"), false)] : []),
  ];
}

export function resolveQuestion(state: ReviewState, id: string, resolved: boolean): PatchOp[] {
  return [replace(r("questions", questionIndex(state, id), "resolved"), resolved)];
}

/** Where a comment drafted from a finding attaches by default. */
export function findingAnchor(finding: Finding): Anchor {
  return anchorOf(finding.primary);
}

function requestIndex(state: ReviewState, id: string): number {
  const index = state.requests.findIndex((q) => q.id === id);
  if (index < 0) {
    throw new SurfaceError(`unknown change request "${id}"`);
  }
  return index;
}

export function requestOf(state: ReviewState, id: string): ChangeRequest {
  return state.requests[requestIndex(state, id)];
}

const requestPtr = (state: ReviewState, id: string) => r("requests", requestIndex(state, id));

export interface NewRequest {
  anchor?: Anchor;
  anchorText?: string;
  body: string;
  origin?: CommentOrigin;
}

/** A request may point anywhere in the repo: an edit can take its file out of the diff. */
function checkRequestAnchor(anchor: Anchor, what: string): void {
  checkPath(anchor.path, what);
  checkSide(anchor.side, what);
  checkLines(anchor.startLine ?? anchor.line, anchor.line, what);
}

/** Ops that add a pending change request; it waits for the user to send the batch. */
export function addRequest(state: ReviewState, input: NewRequest, now: string): Created {
  requireLive(state);
  if (input.anchor) {
    checkRequestAnchor(input.anchor, "request");
  }
  checkText(input.body, "a request");
  const id = `R${state.nextRequestId}`;
  const fingerprint = input.anchor ? state.files.find((f) => f.path === input.anchor!.path)?.fingerprint : undefined;
  const request: ChangeRequest = { id, ...rounds.newRoundWork(input.body, now), origin: input.origin ?? { kind: "manual" }, createdAt: now, updatedAt: now };
  if (input.anchor) {
    request.anchor = { ...input.anchor };
  }
  if (input.anchorText !== undefined) {
    request.anchorText = input.anchorText;
  }
  if (fingerprint) {
    request.fingerprint = fingerprint;
  }
  return { id, ops: [append(r("requests"), request), replace(r("nextRequestId"), state.nextRequestId + 1)] };
}

export function setAnchorText(state: ReviewState, id: string, text: string): PatchOp[] {
  return [add(child(requestPtr(state, id), "anchorText"), text)];
}

/** Ops that rewrite a pending request's text; it is always the last user message. */
export function editRequest(state: ReviewState, id: string, body: string, now: string): PatchOp[] {
  checkText(body, "a request");
  const p = requestPtr(state, id);
  return [...rounds.editRoundText(p, requestOf(state, id), body, id), replace(child(p, "updatedAt"), now)];
}

export function deleteRequest(state: ReviewState, id: string): PatchOp[] {
  const request = requestOf(state, id);
  if (request.status !== "pending") {
    throw new SurfaceError(`${id} is ${request.status}; only pending requests can be deleted`);
  }
  if (request.messages.length > 1) {
    throw new SurfaceError(`${id} already has a history with the agent; resolve it instead of deleting`);
  }
  return [remove(requestPtr(state, id))];
}

/** Ops that reply to a request the agent answered, putting it back in the next batch. */
export function followUpRequest(state: ReviewState, id: string, text: string, now: string): PatchOp[] {
  checkText(text, "a follow-up");
  const p = requestPtr(state, id);
  return [...rounds.followUpRound(p, requestOf(state, id), text, now, id), replace(child(p, "updatedAt"), now)];
}

/** Ops that send every pending request as one round; returns the requests sent. */
export function sendRequests(state: ReviewState, now: string): rounds.SentRound {
  requireLive(state);
  if (state.requests.some((q) => q.status === "sent")) {
    throw new SurfaceError("the agent is still working on the last batch");
  }
  const pending = state.requests.flatMap((q, i) => (q.status === "pending" ? [i] : []));
  if (!pending.length) {
    throw new SurfaceError("there are no pending requests to send");
  }
  const round = state.requestRound + 1;
  const ptrs = pending.map((i) => item(r("requests"), i));
  return {
    ops: [replace(r("requestRound"), round), ...rounds.sendRound(ptrs, round), ...ptrs.map((p) => replace(child(p, "updatedAt"), now))],
    round,
    ids: pending.map((i) => state.requests[i].id),
  };
}

/** Ops that take an unanswered batch back, so it can be edited and sent again. */
export function recallRequests(state: ReviewState, now: string): PatchOp[] {
  const sent = state.requests.flatMap((work, i) => (work.status === "sent" ? [{ p: r("requests", i), work }] : []));
  return [...rounds.recallRound(sent), ...sent.map(({ p }) => replace(child(p, "updatedAt"), now))];
}

export interface RequestUpdate extends RoundUpdate {
  requestId: string;
  /** Where the change sits now, when it moved. */
  anchor?: Anchor;
}

/** Ops that record the agent's outcome for each request, after the files were refreshed. */
export function updateRequests(state: ReviewState, updates: RequestUpdate[], now: string): PatchOp[] {
  requireLive(state);
  const errors: string[] = [];
  const ops: PatchOp[] = [];
  for (const u of updates) {
    const ri = state.requests.findIndex((q) => q.id === u.requestId);
    if (ri < 0) {
      errors.push(`unknown change request "${u.requestId}"`);
      continue;
    }
    errors.push(...rounds.checkUpdate(u, u.requestId));
    if (u.anchor) {
      try {
        checkRequestAnchor(u.anchor, `${u.requestId} anchor`);
      } catch (error) {
        errors.push(`${u.requestId}: ${messageOf(error)}`);
      }
    }
    const p = r("requests", ri);
    ops.push(...rounds.updateRound(p, { status: u.status, reply: u.reply ?? "" }, now), replace(child(p, "updatedAt"), now));
    if (u.anchor) {
      ops.push(add(child(p, "anchor"), { ...u.anchor }));
      if (state.requests[ri].anchorText !== undefined) {
        ops.push(remove(child(p, "anchorText")));
      }
      const fingerprint = state.files.find((f) => f.path === u.anchor!.path)?.fingerprint;
      if (fingerprint) {
        ops.push(add(child(p, "fingerprint"), fingerprint));
      } else if (state.requests[ri].fingerprint !== undefined) {
        ops.push(remove(child(p, "fingerprint")));
      }
    }
  }
  if (errors.length) {
    throw new SurfaceError(`invalid request updates:\n- ${errors.join("\n- ")}`);
  }
  return ops;
}
