import { Type } from "typebox";
import { defineSurfaceTool, defineWorkflow } from "../../../src/host/workflow.ts";
import { codeRefSchema, LabeledVisual } from "../../../src/kit/schemas.ts";
import { parseAction, type PageAction } from "./actions.ts";
import { FeedbackSession } from "./session.ts";
import { emptyState, type FeedbackState } from "./state.ts";

const CodeRef = codeRefSchema("Repository-relative path.", "Why this code matters to the item, one line.");
const Level = Type.Union([Type.Literal("Low"), Type.Literal("Medium"), Type.Literal("High")]);

const Analysis = Type.Object({
  itemId: Type.String({ description: "e.g. PF-3" }),
  meaning: Type.String({ description: "What the reviewer is asking for, in plain words, one or two sentences." }),
  recommendation: Type.Union([Type.Literal("fix"), Type.Literal("respond"), Type.Literal("skip")]),
  rationale: Type.String({ description: "One or two sentences: whether you agree and why." }),
  risk: Level,
  importance: Level,
  rework: Level,
  promised: Type.Boolean({ description: "True only when the user's own reply clearly commits to a specific fix." }),
  promisedFix: Type.Optional(Type.String({ description: "The fix the user promised, as an instruction." })),
  nextStep: Type.Optional(Type.String({ description: "The concrete change to make, or what to say if nothing changes." })),
  refs: Type.Optional(Type.Array(CodeRef, { description: "The code a reader needs to understand the item." })),
  visuals: Type.Optional(Type.Array(LabeledVisual, { description: "0-2 views, only when structure explains it better than prose." })),
});

const open = defineSurfaceTool({
  name: "surface_feedback_open",
  label: "Feedback open",
  opens: true,
  description:
    "Load a PR's review feedback (review threads, review summaries, PR comments) from the user's checkout and open the feedback page. Without a PR, opens local work so feedback pasted in chat can be added with surface_feedback_add. " +
    "When items need triage, the result carries the triage request: triage them now with surface_feedback_triage. Otherwise end your turn; page requests arrive as 'Surface · feedback ·' messages.",
  promptSnippet: "surface_feedback_open: show a PR's review feedback on the feedback page to triage, fix, commit and reply",
  parameters: Type.Object({
    worktree: Type.String({ description: "Absolute path of the user's checkout of the PR branch." }),
    pr: Type.Optional(Type.String({ description: "PR number, URL, or branch, as gh pr view accepts it. Omit for feedback from chat on local work." })),
    base: Type.Optional(Type.String({ description: "Without a PR: the ref to treat as the base. Defaults to the default branch." })),
  }),
  async run(session: FeedbackSession, params) {
    const opened = await session.open(params);
    const { pr, items, target } = session.state;
    const what = pr ? `${pr.owner}/${pr.repo}#${pr.number} "${pr.title}"` : `local work on ${target!.branch || "a detached HEAD"}`;
    const hidden = items.filter((i) => i.hidden).length;
    const head = `Opened ${what} on the feedback page: ${opened.url}\n${items.length} feedback items${hidden ? ` (${hidden} hidden bot comments)` : ""}.${opened.warning ? `\nWarning: ${opened.warning}. Tell the user.` : ""}`;
    if (!opened.triage) {
      return { text: `${head}\nNothing needs triage. End your turn; page requests arrive as messages.`, details: { url: opened.url }, terminate: true };
    }
    return { text: `${head}\n\nTriage these now, then end your turn.\n${opened.triage}`, details: { url: opened.url } };
  },
});

const addItems = defineSurfaceTool({
  name: "surface_feedback_add",
  label: "Feedback add",
  description:
    "Add feedback the user pasted in chat (not on GitHub) as items on the page. Replies to these are copied by the user, never posted. The result carries the triage request for the new items: triage them with surface_feedback_triage.",
  parameters: Type.Object({
    items: Type.Array(
      Type.Object({
        body: Type.String({ description: "The feedback, verbatim." }),
        author: Type.Optional(Type.String({ description: "Who gave it, if known." })),
        ref: Type.Optional(CodeRef),
      }),
      { minItems: 1 },
    ),
  }),
  run(session: FeedbackSession, params) {
    const { ids, triage } = session.addChatItemsForTriage(params.items);
    return { text: `Added ${ids.join(", ")}. Triage them now with surface_feedback_triage.\n${triage}`, details: { ids } };
  },
});

const triage = defineSurfaceTool({
  name: "surface_feedback_triage",
  label: "Feedback triage",
  description:
    "Publish your analysis of feedback items to the page: meaning, recommendation, R/I/W, promised fixes, code refs and visuals. Risk is the risk the change introduces; importance is how much it matters to the PR's goal; rework is how much code changes. " +
    "An item the user already promised to fix is queued as a pending fix. Set final false to publish a first batch and keep going.",
  parameters: Type.Object({
    analyses: Type.Array(Analysis, { minItems: 1 }),
    final: Type.Optional(Type.Boolean({ description: "False when more analyses follow in another call. Defaults to true." })),
  }),
  run(session: FeedbackSession, params) {
    const final = params.final ?? true;
    session.postAnalyses(params.analyses, final);
    const left = session.state.items.filter((i) => !i.hidden && !i.analysis).map((i) => i.id);
    const tail = final ? `${left.length ? ` Still without analysis: ${left.join(", ")}.` : ""} End your turn; the user decides on the page.` : " Continue with the rest.";
    return { text: `Published ${params.analyses.length} analyses.${tail}`, details: { count: params.analyses.length }, terminate: final };
  },
});

const status = defineSurfaceTool({
  name: "surface_feedback_status",
  label: "Feedback status",
  description: "Show progress on triage or a commit proposal the page asked for, or mark it failed with the reason. Refused when that task is not running; it is not a progress line for fix rounds or other work.",
  parameters: Type.Object({
    task: Type.Union([Type.Literal("triage"), Type.Literal("proposing")]),
    status: Type.Union([Type.Literal("running"), Type.Literal("failed")]),
    note: Type.String({ description: "One short line." }),
  }),
  run(session: FeedbackSession, params) {
    session.setTaskStatus(params.task, params.status, params.note);
    return { text: `${params.task}: ${params.status}: ${params.note}`, details: params };
  },
});

const answer = defineSurfaceTool({
  name: "surface_feedback_answer",
  label: "Feedback answer",
  description: "Answer the user's question about a feedback item in its discussion on the page, optionally adding visuals.",
  parameters: Type.Object({
    itemId: Type.String({ description: "e.g. PF-3" }),
    text: Type.String({ description: "Two to five sentences. Markdown." }),
    visuals: Type.Optional(Type.Array(LabeledVisual)),
  }),
  run(session: FeedbackSession, params) {
    session.answer(params.itemId, params.text, params.visuals);
    return { text: `Answered on ${params.itemId}. End your turn.`, details: { itemId: params.itemId }, terminate: true };
  },
});

const fixUpdate = defineSurfaceTool({
  name: "surface_feedback_fix_update",
  label: "Feedback fix update",
  description: "After making a round of fixes in the worktree (without committing), report the outcome of every item in the round. The page then reloads the diff. Call it once per round, at the end.",
  parameters: Type.Object({
    updates: Type.Array(
      Type.Object({
        itemId: Type.String({ description: "e.g. PF-3" }),
        status: Type.Union([Type.Literal("done"), Type.Literal("declined"), Type.Literal("needs-input")]),
        reply: Type.String({ description: "One plain line: what you changed, why you didn't, or your question." }),
        files: Type.Optional(Type.Array(Type.String(), { description: "Repository-relative paths you changed for this item." })),
      }),
      { minItems: 1 },
    ),
  }),
  async run(session: FeedbackSession, params) {
    await session.updateFixes(params.updates);
    return { text: `Updated ${params.updates.length} fix${params.updates.length === 1 ? "" : "es"} and reloaded the diff. End your turn.`, details: { count: params.updates.length }, terminate: true };
  },
});

const commits = defineSurfaceTool({
  name: "surface_feedback_commits",
  label: "Feedback commits",
  description: "Propose commits for the fixes, replacing earlier open proposals. Each names its message, the feedback items it settles, and the exact paths. Never commits; the user commits each one from the page.",
  parameters: Type.Object({
    commits: Type.Array(
      Type.Object({
        message: Type.String({ description: "The commit message, in the repository's style." }),
        items: Type.Array(Type.String(), { description: "Feedback item ids this commit settles." }),
        paths: Type.Array(Type.String(), { minItems: 1, description: "Repository-relative paths to commit." }),
      }),
      { minItems: 1 },
    ),
  }),
  run(session: FeedbackSession, params) {
    session.proposeCommits(params.commits);
    return { text: `Proposed ${params.commits.length} commit${params.commits.length === 1 ? "" : "s"}. End your turn; the user commits from the page.`, details: { count: params.commits.length }, terminate: true };
  },
});

const replyDraft = defineSurfaceTool({
  name: "surface_feedback_reply_draft",
  label: "Feedback reply draft",
  description: "Write or revise the reply draft for a feedback item. Never posts to GitHub; only the user's click on the page does.",
  parameters: Type.Object({
    itemId: Type.String({ description: "e.g. PF-3" }),
    body: Type.String({ description: "The reply as GitHub markdown, usually one or two lines." }),
    note: Type.Optional(Type.String({ description: "One line for the user about this draft, shown beside it." })),
  }),
  run(session: FeedbackSession, params) {
    session.draftReply(params.itemId, params.body, params.note);
    const waiting = session.state.items.filter((i) => i.reply?.assisting).map((i) => i.id);
    return { text: `Reply for ${params.itemId} is on the page.${waiting.length ? ` Still waiting for drafts: ${waiting.join(", ")}.` : ""}`, details: { itemId: params.itemId } };
  },
});

export default defineWorkflow<FeedbackState, PageAction, FeedbackSession>({
  id: "feedback",
  title: "pr feedback",
  emptyState,
  parseAction,
  tools: [open, addItems, triage, status, answer, fixUpdate, commits, replyDraft],
  create: (ctx) => new FeedbackSession(ctx),
});
