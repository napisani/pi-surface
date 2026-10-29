import { Type } from "typebox";
import { defineSurfaceTool, defineWorkflow } from "../../../src/host/workflow.ts";
import { FINDING_DIMENSIONS, FIX_SIZES, TRIAGE_BUCKETS } from "../../../src/kit/findings.ts";
import { Anchor, codeRefSchema, LabeledVisual } from "../../../src/kit/schemas.ts";
import { parseAction, type PageAction } from "./actions.ts";
import { ReviewSession } from "./session.ts";
import { emptyState } from "./state.ts";

const CodeRef = codeRefSchema(
  "Repository-relative path. May be outside the PR's files, e.g. an affected caller.",
  "Why this code matters to the finding, one line.",
);

const Triage = Type.Object(
  {
    bucket: Type.Union(
      TRIAGE_BUCKETS.map((b) => Type.Literal(b)),
      { description: "fix-now: Trivial/Small fix inside the diff's files. fix-now-expands: worth doing here though it grows the diff. defer: real, file a follow-up. skip: not worth acting on. Critical and High are never defer or skip." },
    ),
    fixSize: Type.Union(
      FIX_SIZES.map((s) => Type.Literal(s)),
      { description: "Trivial: one line or expression. Small: a few lines, same file. Moderate: new logic or a helper in a file the diff touches. Large: outside the diff or a refactor." },
    ),
    touches: Type.Array(Type.String(), { minItems: 1, description: "Repository-relative files the fix edits; any outside the diff make it expand scope." }),
    reason: Type.String({ description: "One sentence: severity, fix size, and why it landed in this bucket." }),
  },
  { description: "The mvr-suggestions verdict on this finding." },
);

const Score = Type.Object({ value: Type.Integer({ minimum: 1, maximum: 5 }), why: Type.String({ description: "One short line." }) });
const Scores = Type.Object(Object.fromEntries(FINDING_DIMENSIONS.map((d) => [d.id, Type.Object(Score.properties, { description: d.hint })])), {
  description: "1-5 per axis, 5 being the strongest case for fixing it in this diff: high impact, likely, certain, an easy, contained, safe and testable fix.",
});

const Finding = Type.Object({
  title: Type.String(),
  severity: Type.Union(["Critical", "High", "Medium", "Low"].map((s) => Type.Literal(s))),
  confidence: Type.Union(["High", "Medium", "Low"].map((s) => Type.Literal(s))),
  confidenceReason: Type.Optional(Type.String()),
  category: Type.String({ description: "The multi-valued-review lens, e.g. correctness-invariants." }),
  summary: Type.String({ description: "2-4 sentences: what the issue is and why it matters. Markdown." }),
  fix: Type.Optional(Type.String()),
  evidence: Type.Optional(Type.String({ description: "Verbatim quoted excerpt of the triggering code." })),
  verified: Type.Optional(Type.String()),
  primary: CodeRef,
  related: Type.Optional(Type.Array(CodeRef, { description: "Other code the reader needs: callers, the guard that is missing, the schema." })),
  visuals: Type.Optional(Type.Array(LabeledVisual, { description: "1-3 views that make the issue obvious, chosen per finding." })),
  triage: Triage,
  scores: Scores,
});

const open = defineSurfaceTool({
  name: "surface_review_open",
  label: "Review open",
  opens: true,
  description:
    "Show code on the review page and open it: local changes in a working tree (no pr), or a GitHub pull request. " +
    "A live review reads the working tree so the user can send change requests that you apply; a pinned review (PR only) reads the PR head and needs the worktree checked out at it. " +
    "The turn ends after it; the user's requests from the page arrive as 'Surface · review ·' messages.",
  promptSnippet: "surface_review_open: show local changes or a GitHub PR on the review page (diffs, change requests, comments, findings, walkthrough)",
  parameters: Type.Object({
    worktree: Type.String({ description: "Absolute path of the checkout to read code and diffs from." }),
    pr: Type.Optional(Type.String({ description: "PR number, URL, or branch, as gh pr view accepts it. Omit for local changes." })),
    base: Type.Optional(Type.String({ description: "Without a PR: the ref to compare against (its merge base with HEAD). Defaults to the default branch; HEAD shows only uncommitted changes." })),
    live: Type.Optional(Type.Boolean({ description: "Read the working tree and allow change requests. Defaults to true without a PR and false with one; set true for the user's own checkout of their PR." })),
  }),
  async run(session: ReviewSession, params) {
    const url = await session.open(params);
    const { target, pr, files, remote } = session.state;
    const t = target!;
    const counts = ["impl", "test", "docs", "config"].map((c) => `${files.filter((f) => f.category === c).length} ${c}`).join(", ");
    const what = pr ? `${pr.owner}/${pr.repo}#${pr.number} "${pr.title}" (${remote.length} existing review comments)` : `local changes on ${t.branch || "a detached HEAD"}`;
    return {
      text:
        `Opened ${what} on the review page: ${url}\n` +
        `${t.mode} review against ${t.baseRef} (merge base ${t.mergeBase.slice(0, 12)}); ${files.length} files (${counts}).\n` +
        "End your turn now. Do not wait or poll; page requests arrive as messages.",
      details: { url, mode: t.mode, number: pr?.number },
      terminate: true,
    };
  },
});

const status = defineSurfaceTool({
  name: "surface_review_status",
  label: "Review status",
  description:
    "Show progress on a review or walkthrough the page asked for, or mark it failed with the reason. Refused when that task is not running; it is not a progress line for other work such as change requests. Results themselves go through surface_review_findings and surface_review_walkthrough.",
  parameters: Type.Object({
    task: Type.Union([Type.Literal("review"), Type.Literal("walkthrough")]),
    status: Type.Union([Type.Literal("running"), Type.Literal("failed")]),
    note: Type.String({ description: "One short line, e.g. 'lenses running (6)' or why it failed." }),
  }),
  run(session: ReviewSession, params) {
    session.setTaskStatus(params.task, params.status, params.note);
    return { text: `${params.task}: ${params.status}: ${params.note}`, details: params };
  },
});

const findings = defineSurfaceTool({
  name: "surface_review_findings",
  label: "Review findings",
  description:
    "Publish a multi-valued review's verified, consolidated findings to the page, replacing earlier ones. Order findings Critical to Low as in the report; they are numbered F1.. in that order. " +
    "Every finding needs a primary code ref, a triage verdict and a score on every axis; add related refs and 1-3 visuals that explain it.",
  parameters: Type.Object({
    summary: Type.Object({
      intent: Type.String({ description: "The change's intent paragraph, or 'not determined'." }),
      risk: Type.Union([Type.Literal("Low"), Type.Literal("Medium"), Type.Literal("High")]),
      scope: Type.String({ description: "The report's Scope and Base lines, e.g. 'diff · 14 files · merge-base abc123..def456'." }),
    }),
    findings: Type.Array(Finding),
    dropped: Type.Optional(Type.Array(Type.Object({ severity: Type.String(), title: Type.String(), lens: Type.String(), reason: Type.String() }))),
    disagreements: Type.Optional(Type.Array(Type.String())),
  }),
  run(session: ReviewSession, params) {
    session.postFindings(params);
    return {
      text: `Published ${params.findings.length} findings to the review page. End your turn; the user acts on them from the page.`,
      details: { count: params.findings.length },
      terminate: true,
    };
  },
});

const commentDraft = defineSurfaceTool({
  name: "surface_review_comment_draft",
  label: "Review comment draft",
  description:
    "Write or revise a GitHub review comment draft on the page (PR reviews only). With commentId, replaces that draft's body (and anchor if given). Without it, creates a draft: from a finding (findingId; anchor defaults to its primary location) or at an explicit anchor. " +
    "Never posts to GitHub; only the user's click on the page does.",
  parameters: Type.Object({
    commentId: Type.Optional(Type.String({ description: "Existing draft to revise, e.g. C3." })),
    findingId: Type.Optional(Type.String({ description: "Finding this comment is drafted from, e.g. F2." })),
    anchor: Type.Optional(Anchor),
    body: Type.String({ description: "The comment as GitHub markdown. A ```suggestion block proposes replacement lines for the anchored range." }),
    note: Type.Optional(Type.String({ description: "One line for the user about this draft, shown beside it." })),
  }),
  run(session: ReviewSession, params) {
    const id = session.draftComment(params);
    return { text: `Draft ${id} is on the page.`, details: { commentId: id } };
  },
});

const findingReply = defineSurfaceTool({
  name: "surface_review_finding_reply",
  label: "Review finding reply",
  description: "Answer the user's question about a finding in its thread, optionally adding visuals to the finding.",
  parameters: Type.Object({
    findingId: Type.String(),
    text: Type.String({ description: "Short answer. Markdown." }),
    visuals: Type.Optional(Type.Array(LabeledVisual)),
  }),
  run(session: ReviewSession, params) {
    session.findingReply(params.findingId, params.text, params.visuals);
    return { text: `Replied in ${params.findingId}'s thread.`, details: { findingId: params.findingId } };
  },
});

const questionReply = defineSurfaceTool({
  name: "surface_review_question_reply",
  label: "Review question reply",
  description: "Answer the user's question about some code, a walkthrough step or the change in its thread on the page, optionally adding visuals.",
  parameters: Type.Object({
    questionId: Type.String({ description: "e.g. Q2" }),
    text: Type.String({ description: "Short, direct answer. Markdown." }),
    visuals: Type.Optional(Type.Array(LabeledVisual)),
  }),
  run(session: ReviewSession, params) {
    session.questionReply(params.questionId, params.text, params.visuals);
    return { text: `Answered ${params.questionId} on the page. End your turn.`, details: { questionId: params.questionId } };
  },
});

const walkthrough = defineSurfaceTool({
  name: "surface_review_walkthrough",
  label: "Review walkthrough",
  description: "Publish a guided tour of the changes to the page, replacing any earlier one. Steps are shown in order, each beside its code.",
  parameters: Type.Object({
    title: Type.String(),
    summary: Type.String({ description: "2-4 sentences: what the PR does and the path the tour takes. Markdown." }),
    steps: Type.Array(
      Type.Object({
        title: Type.String(),
        body: Type.String({ description: "What to notice here and why it matters. Markdown, a short paragraph." }),
        ref: CodeRef,
        visual: Type.Optional(LabeledVisual),
      }),
      { minItems: 1 },
    ),
  }),
  run(session: ReviewSession, params) {
    session.postWalkthrough(params);
    return { text: `Published a ${params.steps.length}-step walkthrough. End your turn.`, details: { steps: params.steps.length }, terminate: true };
  },
});

const requestUpdate = defineSurfaceTool({
  name: "surface_review_request_update",
  label: "Review request update",
  description:
    "After applying a round of change requests in the worktree, report the outcome of every request in it. The page then reloads the diff so the user sees your edits. Call it once per round, at the end.",
  parameters: Type.Object({
    updates: Type.Array(
      Type.Object({
        requestId: Type.String({ description: "e.g. R3" }),
        status: Type.Union([Type.Literal("done"), Type.Literal("declined"), Type.Literal("needs-input")]),
        reply: Type.String({ description: "One plain line: what you changed, why you didn't, or the question you need answered." }),
        anchor: Type.Optional(Anchor),
      }),
      { minItems: 1 },
    ),
  }),
  async run(session: ReviewSession, params) {
    await session.updateRequests(params.updates);
    const pending = session.state.requests.filter((q) => q.status === "pending").length;
    return {
      text: `Updated ${params.updates.length} request${params.updates.length === 1 ? "" : "s"} and reloaded the diff${pending ? `; ${pending} new pending request(s) wait for the user to send them` : ""}. End your turn.`,
      details: { count: params.updates.length },
      terminate: true,
    };
  },
});

export default defineWorkflow<ReturnType<typeof emptyState>, PageAction, ReviewSession>({
  id: "review",
  title: "code review",
  emptyState,
  parseAction,
  tools: [open, status, findings, commentDraft, findingReply, questionReply, walkthrough, requestUpdate],
  create: (ctx) => new ReviewSession(ctx),
});
