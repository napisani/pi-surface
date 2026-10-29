import { Type, type Static, type TProperties } from "typebox";
import { decodeAction, inArea, trimmed, type Json } from "../../../src/host/decode.ts";
import { applyPatch, type PatchOp } from "../../../src/host/patch.ts";
import { SurfaceError } from "../../../src/host/workflow.ts";
import {
  addDiscussion,
  addReplyMessage,
  commitFor,
  decide,
  deleteCommit,
  deleteReply,
  editCommit,
  editFix,
  followUpFix,
  itemOf,
  recallFixes,
  resolvableThread,
  sendFixes,
  setAssisting,
  setFlag,
  startCommit,
  startPosting,
  startPush,
  startTask,
  stopTask,
  untriaged,
  writeReply,
  type FeedbackItem,
  type FeedbackState,
} from "./state.ts";

const MAX_TEXT = 20_000;
const MAX_IDS = 100;

const Id = Type.String({ minLength: 1, maxLength: 1000 });
const Text = Type.String({ minLength: 1, maxLength: MAX_TEXT });
const OptionalText = Type.Optional(Type.String({ maxLength: MAX_TEXT }));
const Ids = (minItems: number) => Type.Array(Id, { minItems, maxItems: MAX_IDS });
const action = <T extends string, P extends TProperties>(type: T, properties: P) => Type.Object({ type: Type.Literal(type), ...properties });
const DecisionSchema = Type.Enum(["undecided", "fix", "respond", "skip"]);

/** What the page may ask for, one schema per action type. Anything else is rejected before it touches state. */
const ACTIONS = {
  "item.decide": action("item.decide", { itemId: Id, decision: DecisionSchema, instruction: OptionalText }),
  "item.ask": action("item.ask", { itemId: Id, text: Text }),
  "item.flag": action("item.flag", { itemId: Id, flag: Type.Enum(["hidden", "closed"]), value: Type.Boolean() }),
  "fix.edit": action("fix.edit", { itemId: Id, text: Text }),
  "fix.followUp": action("fix.followUp", { itemId: Id, text: Text }),
  "fixes.send": action("fixes.send", {}),
  "fixes.recall": action("fixes.recall", {}),
  "triage.run": action("triage.run", { itemIds: Type.Optional(Ids(1)) }),
  "reply.edit": action("reply.edit", { itemId: Id, body: Text }),
  "reply.delete": action("reply.delete", { itemId: Id }),
  "reply.assist": action("reply.assist", { itemId: Id, instruction: Text }),
  "reply.ask": action("reply.ask", { itemId: Id, text: Text }),
  "reply.stopAssist": action("reply.stopAssist", { itemId: Id }),
  "replies.autoDraft": action("replies.autoDraft", { itemIds: Ids(1), instruction: OptionalText }),
  "reply.post": action("reply.post", { itemId: Id, resolve: Type.Optional(Type.Boolean()) }),
  "thread.resolve": action("thread.resolve", { itemId: Id }),
  "commits.propose": action("commits.propose", { instruction: OptionalText }),
  "commit.edit": action("commit.edit", { commitId: Id, message: Text, items: Ids(0), paths: Ids(1) }),
  "commit.delete": action("commit.delete", { commitId: Id }),
  "commit.run": action("commit.run", { commitId: Id }),
  push: action("push", {}),
  "task.stop": action("task.stop", { task: Type.Enum(["triage", "proposing"]) }),
  refresh: action("refresh", {}),
};

export type PageAction = Static<(typeof ACTIONS)[keyof typeof ACTIONS]>;

/** Work the session does after committing an action's ops. */
export type Effect =
  | { kind: "post"; itemId: string; resolve: boolean }
  | { kind: "resolve"; itemId: string }
  | { kind: "commit"; commitId: string }
  | { kind: "push" }
  | { kind: "refresh" };

export interface AgentMessage {
  content: string;
  details: PageAction;
}

/** Decodes a page action, then trims its text, drops blank optional fields and repeated ids. */
export function parseAction(body: Json): PageAction {
  const a = decodeAction(ACTIONS, body);
  if ("text" in a) {
    a.text = a.text.trim();
  }
  if ("instruction" in a) {
    const instruction = trimmed(a.instruction);
    if (instruction === undefined) {
      delete a.instruction;
    } else {
      a.instruction = instruction;
    }
  }
  if ("itemIds" in a && a.itemIds) {
    a.itemIds = [...new Set(a.itemIds)];
  }
  if (a.type === "commit.edit") {
    a.items = [...new Set(a.items)];
    a.paths = [...new Set(a.paths)];
  }
  if (a.type === "reply.post" && !a.resolve) {
    delete a.resolve;
  }
  return a;
}

/** One line naming what the page has open, so every message stands on its own. */
export function feedbackLine(state: FeedbackState): string {
  const t = state.target!;
  const what = state.pr ? `${state.pr.owner}/${state.pr.repo}#${state.pr.number} "${state.pr.title}"` : `local work on ${t.branch || "a detached HEAD"}`;
  return `${what} · worktree ${t.worktree} · branch ${t.branch || "(detached)"}`;
}

const KIND_LABEL = { thread: "review thread", review: "review summary", conversation: "PR comment", chat: "from chat" } as const;

function whereOf(item: FeedbackItem): string {
  const a = item.anchor;
  if (!a) {
    return "";
  }
  const line = a.line ?? a.originalLine;
  const range = line === null || line === undefined ? "" : `:${a.startLine ? `${a.startLine}-` : ""}${line}`;
  let rev = a.side === "LEFT" ? "merge base" : "PR head";
  if (item.source.kind === "chat") {
    rev = "working tree";
  }
  return ` on ${a.path}${range} (${rev})`;
}

/** The item's header line: id, kind, place, reviewer and thread state. */
export function itemLine(item: FeedbackItem): string {
  const flags = item.source.kind === "thread" ? [item.source.resolved ? "resolved" : "", item.source.outdated ? "outdated" : ""].filter(Boolean) : [];
  const state = item.source.kind === "review" ? ` · ${item.source.state.toLowerCase().replace("_", " ")}` : "";
  return `- ${item.id} · ${KIND_LABEL[item.source.kind]}${whereOf(item)} · @${item.author}${state}${flags.length ? ` · ${flags.join(", ")}` : ""}`;
}

const indent = (body: string, by = "    ") => body.trim().split("\n").map((l) => `${by}${l}`).join("\n");

/** What the reviewer wrote, with any replies, quoted under the item line. */
function sourceText(item: FeedbackItem): string[] {
  return item.messages.map((m) => `  @${m.author}${m.mine ? " (you)" : ""}:\n${indent(m.body || "(empty)")}`);
}

function analysisLine(item: FeedbackItem): string[] {
  const a = item.analysis;
  if (!a) {
    return [];
  }
  return [`  your triage: ${a.recommendation} · R/I/W ${a.risk[0]}/${a.importance[0]}/${a.rework[0]} · ${a.meaning}`];
}

function decisionLines(state: FeedbackState, item: FeedbackItem): string[] {
  const lines = [`  decision: ${item.decision}`];
  const fix = item.fix;
  if (fix) {
    lines.push(`  fix: ${fix.status}${fix.files.length ? ` · files ${fix.files.join(", ")}` : ""}`);
    for (const m of fix.messages) {
      lines.push(`    ${m.role === "user" ? "user" : "you"}: ${m.text}`);
    }
  }
  const commit = commitFor(state, item.id);
  if (commit) {
    lines.push(`  commit: ${commit.sha} "${commit.message.split("\n")[0]}"${commit.pushed ? " (pushed)" : " (not pushed yet)"}`);
  }
  return lines;
}

/** The triage request: every item to analyze, with the reviewer's words. */
export function triageBrief(state: FeedbackState, ids: string[]): string {
  return [
    `Feedback: ${feedbackLine(state)}`,
    `Items to triage (${ids.length}):`,
    ...ids.flatMap((id) => {
      const item = itemOf(state, id);
      return [itemLine(item), ...sourceText(item)];
    }),
    "",
    "Read the code each item points at (git show <PR head>:path for the reviewer's view, the working tree for now), then call surface_feedback_triage with one analysis per item:",
    "meaning in plain words, a recommendation (fix, respond or skip) with its rationale, R/I/W, whether the user already promised a fix in a reply, the next step, code refs, and a visual when structure explains it better than prose.",
  ].join("\n");
}

function questionMessage(state: FeedbackState, item: FeedbackItem): string {
  const earlier = item.discussion.slice(0, -1).map((m) => `${m.role === "user" ? "user" : "you"}: ${m.text}`);
  return [
    `question about ${item.id}`,
    `Feedback: ${feedbackLine(state)}`,
    itemLine(item),
    ...sourceText(item),
    ...analysisLine(item),
    ...(earlier.length ? ["Discussion so far:", ...earlier] : []),
    `Question: ${item.discussion[item.discussion.length - 1].text}`,
    "",
    `Read the code, then answer with surface_feedback_answer (itemId "${item.id}"). Add a visual when a diagram, table or call tree explains it better than words.`,
  ].join("\n");
}

function fixMessage(state: FeedbackState, round: number, ids: string[]): string {
  return [
    `fixes, round ${round}`,
    `Feedback: ${feedbackLine(state)}`,
    ...ids.flatMap((id) => {
      const item = itemOf(state, id);
      return [itemLine(item), ...sourceText(item), ...analysisLine(item), ...item.fix!.messages.map((m) => `  ${m.role === "user" ? "user" : "you"}: ${m.text}`)];
    }),
    "",
    "Make each fix in the worktree, keeping it to what the reviewer and the user asked. The last user line under each item is what to do now. Thread line numbers are on the PR head; find the code there if your edits moved it.",
    "Run the smallest check that covers your edits. Do not commit. Then call surface_feedback_fix_update once, covering every item above: done (name the files you changed), declined (say why), or needs-input (ask your question), each with a one-line reply.",
  ].join("\n");
}

function replyContext(state: FeedbackState, item: FeedbackItem): string[] {
  return [itemLine(item), ...sourceText(item), ...analysisLine(item), ...decisionLines(state, item)];
}

function assistMessage(state: FeedbackState, item: FeedbackItem, instruction: string): string {
  const draft = item.reply?.body.trim();
  return [
    `reply assist · ${item.id}`,
    `Feedback: ${feedbackLine(state)}`,
    ...replyContext(state, item),
    `Request: ${instruction}`,
    "Current draft:",
    draft ? indent(draft, "> ") : "> (empty)",
    "",
    `Write the reply with surface_feedback_reply_draft (itemId "${item.id}"). Do not post; the user posts from the page.`,
  ].join("\n");
}

function replyQuestionMessage(state: FeedbackState, item: FeedbackItem): string {
  const thread = item.replyThread ?? [];
  const earlier = thread.slice(0, -1).map((m) => `${m.role === "user" ? "user" : "you"}: ${m.text}`);
  return [
    `question about ${item.id}'s reply`,
    `Feedback: ${feedbackLine(state)}`,
    ...replyContext(state, item),
    `Reply (${item.reply?.status ?? "draft"}):`,
    indent(item.reply?.body.trim() || "(empty)", "> "),
    ...(earlier.length ? ["Questions so far:", ...earlier] : []),
    `Question: ${thread.at(-1)?.text ?? ""}`,
    "",
    `Answer with surface_feedback_answer (itemId "${item.id}", about "reply"). Answer only: do not rewrite the reply, which the user revises separately.`,
  ].join("\n");
}

function autoDraftMessage(state: FeedbackState, items: FeedbackItem[], instruction: string | undefined): string {
  return [
    `draft replies for ${items.length} item${items.length === 1 ? "" : "s"}`,
    `Feedback: ${feedbackLine(state)}`,
    ...items.flatMap((item) => [...replyContext(state, item), ...(item.reply?.body.trim() ? ["  current draft:", indent(item.reply.body, "  > ")] : [])]),
    ...(instruction ? [`Instruction: ${instruction}`] : []),
    "",
    "Draft one reply per item with surface_feedback_reply_draft: one or two lines saying what changed and where, naming the commit when there is one, or why nothing changed. Do not post; the user posts from the page.",
  ].join("\n");
}

function proposeMessage(state: FeedbackState, instruction: string | undefined): string {
  const committed = new Set(state.commits.filter((c) => c.status === "committed").flatMap((c) => c.items));
  const fixed = state.items.filter((i) => i.fix?.status === "done" && !committed.has(i.id));
  return [
    "propose commits",
    `Feedback: ${feedbackLine(state)}`,
    fixed.length ? "Fixed items not yet committed:" : "No fixed items are waiting for a commit; group whatever uncommitted changes git status shows.",
    ...fixed.map((i) => `${itemLine(i)} · files ${i.fix!.files.join(", ") || "(none reported)"}\n  ${i.fix!.messages.at(-1)?.text ?? ""}`),
    ...(instruction ? [`Instruction: ${instruction}`] : []),
    "",
    "Check git status --porcelain and git diff in the worktree, then call surface_feedback_commits with the commits you propose: a message in the repository's style, the item ids each commit settles, and the exact paths to include.",
    "Do not commit; the user commits each proposal from the page.",
  ].join("\n");
}

/** What one page action does: state changes, the message that wakes the agent, and work for the session. */
export interface Resolution {
  ops: PatchOp[];
  message?: AgentMessage;
  effect?: Effect;
}

type ActionOf<T> = Extract<PageAction, { type: T }>;

function resolveItem(state: FeedbackState, action: ActionOf<`item.${string}` | `fix${string}` | "triage.run">, now: string): Resolution {
  switch (action.type) {
    case "item.decide":
      return { ops: decide(state, action.itemId, action.decision, action.instruction, now) };
    case "item.ask": {
      const ops = addDiscussion(state, action.itemId, { role: "user", text: action.text, at: now });
      const after = applyPatch(structuredClone(state), ops);
      return { ops, message: { content: questionMessage(after, itemOf(after, action.itemId)), details: action } };
    }
    case "item.flag":
      return { ops: setFlag(state, action.itemId, action.flag, action.value) };
    case "fix.edit":
      return { ops: editFix(state, action.itemId, action.text) };
    case "fix.followUp":
      return { ops: followUpFix(state, action.itemId, action.text, now) };
    case "fixes.send": {
      const { ops, round, ids } = sendFixes(state);
      const after = applyPatch(structuredClone(state), ops);
      return { ops, message: { content: fixMessage(after, round, ids), details: action } };
    }
    case "fixes.recall":
      return { ops: recallFixes(state) };
    case "triage.run": {
      const ids = action.itemIds ?? untriaged(state);
      if (!ids.length) {
        throw new SurfaceError("every visible item already has an analysis");
      }
      for (const id of ids) {
        itemOf(state, id);
      }
      return { ops: startTask(state, "triage", now), message: { content: [`triage ${ids.length} item${ids.length === 1 ? "" : "s"}`, triageBrief(state, ids)].join("\n"), details: action } };
    }
  }
}

function resolveReply(state: FeedbackState, action: ActionOf<`repl${string}` | "thread.resolve">, now: string): Resolution {
  switch (action.type) {
    case "reply.edit":
      return { ops: writeReply(state, action.itemId, action.body, now) };
    case "reply.delete":
      return { ops: deleteReply(state, action.itemId) };
    case "reply.assist": {
      const ops = setAssisting(state, action.itemId, true, now);
      return { ops, message: { content: assistMessage(state, itemOf(state, action.itemId), action.instruction), details: action } };
    }
    case "reply.ask": {
      const ops = addReplyMessage(state, action.itemId, { role: "user", text: action.text, at: now });
      const after = applyPatch(structuredClone(state), ops);
      return { ops, message: { content: replyQuestionMessage(after, itemOf(after, action.itemId)), details: action } };
    }
    case "reply.stopAssist":
      return { ops: setAssisting(state, action.itemId, false, now) };
    case "replies.autoDraft": {
      const items = action.itemIds.map((id) => itemOf(state, id));
      let working = state;
      const ops: PatchOp[] = [];
      for (const item of items) {
        const step = setAssisting(working, item.id, true, now);
        ops.push(...step);
        working = applyPatch(structuredClone(working), step);
      }
      return { ops, message: { content: autoDraftMessage(state, items, action.instruction), details: action } };
    }
    case "reply.post":
      return { ops: startPosting(state, action.itemId), effect: { kind: "post", itemId: action.itemId, resolve: action.resolve ?? false } };
    case "thread.resolve":
      resolvableThread(state, action.itemId);
      return { ops: [], effect: { kind: "resolve", itemId: action.itemId } };
  }
}

function resolveCommit(state: FeedbackState, action: ActionOf<`commit${string}` | "push">, now: string): Resolution {
  switch (action.type) {
    case "commits.propose":
      return { ops: startTask(state, "proposing", now), message: { content: proposeMessage(state, action.instruction), details: action } };
    case "commit.edit":
      return { ops: editCommit(state, action.commitId, { message: action.message, items: action.items, paths: action.paths }) };
    case "commit.delete":
      return { ops: deleteCommit(state, action.commitId) };
    case "commit.run":
      return { ops: startCommit(state, action.commitId), effect: { kind: "commit", commitId: action.commitId } };
    case "push":
      return { ops: startPush(state), effect: { kind: "push" } };
  }
}

/**
 * Turns one page action into state changes, the message that wakes the agent
 * when it has work, and any git or GitHub work the session must do.
 */
export function resolveAction(state: FeedbackState, action: PageAction, now: string): Resolution {
  if (inArea(action, "item.") || inArea(action, "fix") || action.type === "triage.run") {
    return resolveItem(state, action, now);
  }
  if (inArea(action, "repl") || action.type === "thread.resolve") {
    return resolveReply(state, action, now);
  }
  if (inArea(action, "commit") || action.type === "push") {
    return resolveCommit(state, action, now);
  }
  if (action.type === "task.stop") {
    return { ops: stopTask(state, action.task, now) };
  }
  if (!state.target) {
    throw new SurfaceError("nothing is loaded");
  }
  return { ops: [], effect: { kind: "refresh" } };
}
