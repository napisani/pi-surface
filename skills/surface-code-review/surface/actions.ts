import { Type, type Static, type TProperties } from "typebox";
import { decodeAction, inArea, trimmed, type Json } from "../../../src/host/decode.ts";
import { applyPatch, type PatchOp } from "../../../src/host/patch.ts";
import { SurfaceError } from "../../../src/host/workflow.ts";
import type { Anchor } from "../../../src/kit/code.ts";
import type { Finding } from "../../../src/kit/findings.ts";
import { Anchor as AnchorSchema, codeRefSchema } from "../../../src/kit/schemas.ts";
import {
  addComment,
  addFindingMessage,
  commentOf,
  deleteComment,
  dismissFinding,
  editComment,
  findingAnchor,
  findingOf,
  moveComment,
  setAssisting,
  startPosting,
  startTask,
  stopTask,
  addQuestionMessage,
  addRequest,
  askQuestion,
  deleteRequest,
  editRequest,
  followUpRequest,
  recallRequests,
  requestOf,
  sendRequests,
  type ChangeRequest,
  questionOf,
  resolveQuestion as resolveQuestionThread,
  type DraftComment,
  type QuestionThread,
  type ReviewState,
} from "./state.ts";

const MAX_TEXT = 20_000;
const MAX_IDS = 50;

const Id = Type.String({ minLength: 1, maxLength: 200 });
const Text = Type.String({ minLength: 1, maxLength: MAX_TEXT });
const OptionalText = Type.Optional(Type.String({ maxLength: MAX_TEXT }));
const Ids = Type.Array(Id, { minItems: 1, maxItems: MAX_IDS });
const action = <T extends string, P extends TProperties>(type: T, properties: P) => Type.Object({ type: Type.Literal(type), ...properties });

/** What the page may ask for, one schema per action type. Anything else is rejected before it touches state. */
const ACTIONS = {
  "comment.create": action("comment.create", {
    anchor: AnchorSchema,
    body: Type.String({ maxLength: MAX_TEXT }),
    inReplyTo: Type.Optional(Type.Integer({ minimum: 1 })),
    then: Type.Optional(Type.Union([Type.Literal("post"), Type.Object({ assist: Text })])),
  }),
  "comment.edit": action("comment.edit", { commentId: Id, body: Text }),
  "comment.move": action("comment.move", { commentId: Id, anchor: AnchorSchema }),
  "comment.delete": action("comment.delete", { commentId: Id }),
  "comment.post": action("comment.post", { commentId: Id }),
  "comment.assist": action("comment.assist", { commentId: Id, instruction: Text }),
  "comment.stopAssist": action("comment.stopAssist", { commentId: Id }),
  "finding.draft": action("finding.draft", { findingId: Id }),
  "finding.dismiss": action("finding.dismiss", { findingId: Id, dismissed: Type.Boolean() }),
  "finding.ask": action("finding.ask", { findingId: Id, text: Text }),
  "findings.autoComment": action("findings.autoComment", { findingIds: Ids, instruction: OptionalText }),
  "review.run": action("review.run", { focus: OptionalText }),
  "walkthrough.run": action("walkthrough.run", { focus: OptionalText }),
  "question.ask": action("question.ask", { ref: Type.Optional(codeRefSchema("A file at that revision.", "Unused.")), stepId: Type.Optional(Id), text: Text }),
  "question.followUp": action("question.followUp", { questionId: Id, text: Text }),
  "question.resolve": action("question.resolve", { questionId: Id, resolved: Type.Boolean() }),
  "request.create": action("request.create", { anchor: Type.Optional(AnchorSchema), anchorText: OptionalText, body: Text }),
  "request.edit": action("request.edit", { requestId: Id, body: Text }),
  "request.delete": action("request.delete", { requestId: Id }),
  "request.followUp": action("request.followUp", { requestId: Id, text: Text }),
  "requests.send": action("requests.send", {}),
  "requests.recall": action("requests.recall", {}),
  "findings.request": action("findings.request", { findingIds: Ids }),
  "task.stop": action("task.stop", { task: Type.Enum(["review", "walkthrough"]) }),
  refresh: action("refresh", {}),
};

export type PageAction = Static<(typeof ACTIONS)[keyof typeof ACTIONS]>;

/** Work the session does after committing an action's ops. */
export type Effect = { kind: "post"; commentId: string } | { kind: "refresh" } | { kind: "anchorText"; requestId: string };

export interface AgentMessage {
  content: string;
  details: PageAction;
}

/** A start line at or past the end line names one line, so it is dropped. */
function normalizeAnchor(anchor: Anchor): void {
  if (anchor.startLine !== undefined && anchor.startLine >= anchor.line) {
    delete anchor.startLine;
  }
}

/** Decodes a page action, then trims its text and drops blank optional fields. */
export function parseAction(body: Json): PageAction {
  const a = decodeAction(ACTIONS, body);
  switch (a.type) {
    case "comment.create":
      normalizeAnchor(a.anchor);
      if (a.then !== undefined && a.then !== "post") {
        a.then.assist = a.then.assist.trim();
      }
      break;
    case "comment.move":
      normalizeAnchor(a.anchor);
      break;
    case "comment.assist":
      a.instruction = a.instruction.trim();
      break;
    case "finding.ask":
    case "question.followUp":
    case "request.followUp":
    case "question.ask":
      a.text = a.text.trim();
      break;
    case "findings.autoComment":
      a.findingIds = [...new Set(a.findingIds)];
      a.instruction = trimmed(a.instruction);
      if (a.instruction === undefined) {
        delete a.instruction;
      }
      break;
    case "review.run":
    case "walkthrough.run":
      a.focus = trimmed(a.focus);
      if (a.focus === undefined) {
        delete a.focus;
      }
      break;
    case "request.create":
      a.body = a.body.trim();
      if (a.anchor) {
        normalizeAnchor(a.anchor);
      }
      break;
    case "findings.request":
      a.findingIds = [...new Set(a.findingIds)];
      break;
    default:
      break;
  }
  return a;
}

const where = (a: Anchor) => `${a.path}:${a.startLine ? `${a.startLine}-` : ""}${a.line} (${a.side})`;
const quote = (body: string) => (body.trim() ? body.split("\n").map((l) => `> ${l}`).join("\n") : "> (empty)");

/** The diff the agent should read, as a command it can run in the worktree. */
export function diffCommand(state: ReviewState): string {
  const t = state.target!;
  return t.mode === "live"
    ? `git diff ${t.mergeBase} (the working tree against the merge base with ${t.baseRef}; untracked files count as added: git ls-files --others --exclude-standard)`
    : `git diff ${t.mergeBase}...${t.head}`;
}

function prLine(state: ReviewState): string {
  const t = state.target!;
  const what = state.pr ? `${state.pr.owner}/${state.pr.repo}#${state.pr.number} "${state.pr.title}"` : `local changes on ${t.branch || "a detached HEAD"}`;
  return `${what} · worktree ${t.worktree} · ${t.mode} · base ${t.baseRef} (${t.mergeBase.slice(0, 12)})`;
}

function findingLine(f: Finding): string {
  const at = `${f.primary.path}:${f.primary.startLine}${f.primary.endLine > f.primary.startLine ? `-${f.primary.endLine}` : ""}`;
  return `- ${f.id} [${f.severity}] ${f.title} · ${at} · ${f.category}${f.triage ? ` · triaged ${f.triage.bucket}` : ""}`;
}

function assistMessage(state: ReviewState, comment: DraftComment, instruction: string): string {
  const origin = comment.origin;
  const finding = origin.kind === "finding" ? state.review.findings.find((f) => f.id === origin.findingId) : undefined;
  return [
    `comment assist · ${comment.id} on ${where(comment.anchor)}`,
    `Review: ${prLine(state)}`,
    `Request: ${instruction}`,
    "Current draft:",
    quote(comment.body),
    ...(finding ? ["", "Drafted from finding:", findingLine(finding), finding.summary] : []),
    "",
    `Read the code around the anchor in the worktree, then write the new body with surface_review_comment_draft (commentId "${comment.id}"). Do not post; the user posts from the page.`,
  ].join("\n");
}

function questionMessage(state: ReviewState, q: QuestionThread): string {
  const about = q.ref ? ` about ${q.ref.path}:${q.ref.startLine}${q.ref.endLine > q.ref.startLine ? `-${q.ref.endLine}` : ""} (${q.ref.rev})` : " about the PR";
  const step = q.stepTitle ? ` · walkthrough step "${q.stepTitle}"` : "";
  const earlier = q.messages.slice(0, -1).map((m) => `${m.role === "user" ? "user" : "you"}: ${m.text}`);
  return [
    `question ${q.id}${about}${step}`,
    `Review: ${prLine(state)}`,
    ...(earlier.length ? ["Thread so far:", ...earlier] : []),
    `Question: ${q.messages[q.messages.length - 1].text}`,
    "",
    `Read the code, then answer with surface_review_question_reply (questionId "${q.id}"). Add a visual when a diagram, table or call tree explains it better than words.`,
  ].join("\n");
}

function requestLines(r: ChangeRequest): string[] {
  const where = r.anchor ? `${r.anchor.path}:${r.anchor.startLine ? `${r.anchor.startLine}-` : ""}${r.anchor.line} (${r.anchor.side === "RIGHT" ? "current code" : "removed code"})` : "the change as a whole";
  const line = r.anchorText !== undefined ? ` · the line read: ${JSON.stringify(r.anchorText.trim())}` : "";
  return [`- ${r.id} at ${where}${line}`, ...r.messages.map((m) => `  ${m.role === "user" ? "user" : "you"}: ${m.text}`)];
}

function sendMessage(state: ReviewState, round: number, ids: string[]): string {
  const requests = ids.map((id) => requestOf(state, id));
  return [
    `change requests, round ${round}`,
    `Review: ${prLine(state)}`,
    ...requests.flatMap(requestLines),
    "",
    "Make each change in the worktree, keeping it to what its request asks. Line numbers are from before your edits; the quoted line text finds the spot if they moved.",
    "Then call surface_review_request_update once, covering every request above: done, declined (say why), or needs-input (ask your question), each with a one-line reply. Give the new anchor when a change moved the lines it was about.",
  ].join("\n");
}

/** What one page action does: state changes, the message that wakes the agent, and GitHub work for the session. */
export interface Resolution {
  ops: PatchOp[];
  message?: AgentMessage;
  effect?: Effect;
}

type ActionOf<T> = Extract<PageAction, { type: T }>;

function resolveComment(state: ReviewState, action: ActionOf<`comment.${string}`>, now: string): Resolution {
  switch (action.type) {
    case "comment.create": {
      const { ops, id } = addComment(state, { anchor: action.anchor, body: action.body, inReplyTo: action.inReplyTo }, now);
      if (!action.then) {
        return { ops };
      }
      const after = applyPatch(structuredClone(state), ops);
      if (action.then === "post") {
        return { ops: [...ops, ...startPosting(after, id)], effect: { kind: "post", commentId: id } };
      }
      const comment = commentOf(after, id);
      return { ops: [...ops, ...setAssisting(after, id, true)], message: { content: assistMessage(after, comment, action.then.assist), details: action } };
    }
    case "comment.edit":
      return { ops: editComment(state, action.commentId, action.body, now) };
    case "comment.move":
      return { ops: moveComment(state, action.commentId, action.anchor, now) };
    case "comment.delete":
      return { ops: deleteComment(state, action.commentId) };
    case "comment.post":
      return { ops: startPosting(state, action.commentId), effect: { kind: "post", commentId: action.commentId } };
    case "comment.assist": {
      const comment = commentOf(state, action.commentId);
      return { ops: setAssisting(state, comment.id, true), message: { content: assistMessage(state, comment, action.instruction), details: action } };
    }
    case "comment.stopAssist":
      return { ops: setAssisting(state, action.commentId, false) };
  }
}

function resolveFinding(state: ReviewState, action: ActionOf<`finding${string}`>, now: string): Resolution {
  switch (action.type) {
    case "finding.draft": {
      const finding = findingOf(state, action.findingId);
      const body = [finding.summary, finding.fix ? `\n**Suggested fix:** ${finding.fix}` : ""].join("");
      return { ops: addComment(state, { anchor: findingAnchor(finding), body, origin: { kind: "finding", findingId: finding.id, findingTitle: finding.title } }, now).ops };
    }
    case "finding.dismiss":
      return { ops: dismissFinding(state, action.findingId, action.dismissed) };
    case "finding.ask": {
      const finding = findingOf(state, action.findingId);
      return {
        ops: addFindingMessage(state, finding.id, { role: "user", text: action.text, at: now }),
        message: {
          content: [
            `question about ${finding.id}`,
            `Review: ${prLine(state)}`,
            findingLine(finding),
            `Question: ${action.text}`,
            "",
            `Answer with surface_review_finding_reply (findingId "${finding.id}"). Add a visual there when a diagram, table or call tree explains it better than words.`,
          ].join("\n"),
          details: action,
        },
      };
    }
    case "findings.autoComment": {
      const findings = action.findingIds.map((id) => findingOf(state, id));
      return {
        ops: [],
        message: {
          content: [
            `draft comments for ${findings.length} finding${findings.length === 1 ? "" : "s"}`,
            `Review: ${prLine(state)}`,
            ...findings.map(findingLine),
            ...(action.instruction ? [`Instruction: ${action.instruction}`] : []),
            "",
            "Draft one review comment per finding with surface_review_comment_draft (findingId set; anchor defaults to the finding's primary location).",
            "Do not post; the drafts appear on the page for the user to edit and post.",
          ].join("\n"),
          details: action,
        },
      };
    }
    case "findings.request":
      return { ops: requestFixes(state, action.findingIds, now) };
  }
}

/** One change request per finding, each applied before the next so their ids run in order. */
function requestFixes(state: ReviewState, findingIds: string[], now: string): PatchOp[] {
  let working = state;
  const ops: PatchOp[] = [];
  for (const id of findingIds) {
    const finding = findingOf(working, id);
    const origin = { kind: "finding" as const, findingId: finding.id, findingTitle: finding.title };
    const fix = finding.fix ? ` ${finding.fix}` : "";
    const anchor = findingAnchor(finding);
    // A finding about a file the diff doesn't touch can't anchor in it; name the place in the text instead.
    const created = working.files.some((f) => f.path === anchor.path)
      ? addRequest(working, { anchor, body: `Fix ${finding.id}: ${finding.title}.${fix}`, origin }, now)
      : addRequest(working, { body: `Fix ${finding.id} at ${anchor.path}:${anchor.line}: ${finding.title}.${fix}`, origin }, now);
    ops.push(...created.ops);
    working = applyPatch(structuredClone(working), created.ops);
  }
  return ops;
}

function resolveTask(state: ReviewState, action: ActionOf<"review.run" | "walkthrough.run">, now: string): Resolution {
  const review = action.type === "review.run";
  const ask = review
    ? `Run the multi-valued-review skill over this diff (${diffCommand(state)} in the worktree), then publish with surface_review_findings. Give every finding its code refs, the visuals that explain it, a triage verdict and a score on every axis, per references/findings.md.`
    : `Write a guided tour of these changes (${diffCommand(state)}) and publish it with surface_review_walkthrough.`;
  return {
    ops: startTask(state, review ? "review" : "walkthrough", action.focus, now),
    message: {
      content: [review ? "run the multi-valued review" : "generate a walkthrough", `Review: ${prLine(state)}`, ...(action.focus ? [`Focus: ${action.focus}`] : []), "", ask].join("\n"),
      details: action,
    },
  };
}

function resolveQuestion(state: ReviewState, action: ActionOf<`question.${string}`>, now: string): Resolution {
  switch (action.type) {
    case "question.ask": {
      const { ops, id } = askQuestion(state, { text: action.text, ref: action.ref, stepId: action.stepId }, now);
      const after = applyPatch(structuredClone(state), ops);
      return { ops, message: { content: questionMessage(after, questionOf(after, id)), details: action } };
    }
    case "question.followUp": {
      const ops = addQuestionMessage(state, action.questionId, { role: "user", text: action.text, at: now });
      const after = applyPatch(structuredClone(state), ops);
      return { ops, message: { content: questionMessage(after, questionOf(after, action.questionId)), details: action } };
    }
    case "question.resolve":
      return { ops: resolveQuestionThread(state, action.questionId, action.resolved) };
  }
}

function resolveRequest(state: ReviewState, action: ActionOf<`request${string}`>, now: string): Resolution {
  switch (action.type) {
    case "request.create": {
      const { ops, id } = addRequest(state, { body: action.body, anchor: action.anchor, anchorText: action.anchorText }, now);
      const resolution: Resolution = { ops };
      if (action.anchor) {
        resolution.effect = { kind: "anchorText", requestId: id };
      }
      return resolution;
    }
    case "request.edit":
      return { ops: editRequest(state, action.requestId, action.body, now) };
    case "request.delete":
      return { ops: deleteRequest(state, action.requestId) };
    case "request.followUp":
      return { ops: followUpRequest(state, action.requestId, action.text, now) };
    case "requests.send": {
      const { ops, round, ids } = sendRequests(state, now);
      const after = applyPatch(structuredClone(state), ops);
      return { ops, message: { content: sendMessage(after, round, ids), details: action } };
    }
    case "requests.recall":
      return { ops: recallRequests(state, now) };
  }
}

/**
 * Turns one page action into state changes, plus the message that wakes the
 * agent when it has work, plus any GitHub call the session must make.
 * Throws SurfaceError for invalid actions.
 */
export function resolveAction(state: ReviewState, action: PageAction, now: string): Resolution {
  if (inArea(action, "comment.")) {
    return resolveComment(state, action, now);
  }
  if (inArea(action, "finding")) {
    return resolveFinding(state, action, now);
  }
  if (inArea(action, "question.")) {
    return resolveQuestion(state, action, now);
  }
  if (inArea(action, "request")) {
    return resolveRequest(state, action, now);
  }
  if (action.type === "review.run" || action.type === "walkthrough.run") {
    return resolveTask(state, action, now);
  }
  if (action.type === "task.stop") {
    return { ops: stopTask(state, action.task, now) };
  }
  if (!state.target) {
    throw new SurfaceError("nothing is loaded");
  }
  return { ops: [], effect: { kind: "refresh" } };
}
