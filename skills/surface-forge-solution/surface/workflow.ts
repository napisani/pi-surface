import { Type } from "typebox";
import { defineSurfaceTool, defineWorkflow } from "../../../src/host/workflow.ts";
import { LensVisual } from "../../../src/kit/schemas.ts";
import { parseAction, type ForgeAction } from "./actions.ts";
import { ForgeSession } from "./session.ts";
import { emptyState, type ForgeState } from "./state.ts";

const LensKind = Type.Union(["callTree", "diff", "code", "mermaid", "data", "query"].map((k) => Type.Literal(k)));
const Score = Type.Object({ value: Type.Integer({ minimum: 1, maximum: 5 }), why: Type.String() });
const Impact = Type.Object({ kind: Type.Union([Type.Literal("add"), Type.Literal("change"), Type.Literal("new"), Type.Literal("warn")]), text: Type.String() });
const OptionFields = {
  description: Type.String({ maxLength: 280, description: "One or two plain sentences, at most 280 characters: what changes and what it costs. No undefined jargon, flag names, or file names." }),
  pros: Type.Array(Type.String({ maxLength: 100 }), { minItems: 1, description: "One short phrase (at most 100 characters) per advantage over the other options." }),
  cons: Type.Array(Type.String({ maxLength: 100 }), { minItems: 1, description: "One short phrase (at most 100 characters) per cost or risk relative to the other options." }),
  visuals: Type.Record(Type.String(), LensVisual, { description: "One entry per lens id." }),
  scores: Type.Record(Type.String(), Score, { description: "One entry per dimension id; 1-5, relative to the other options, 5 = best." }),
  impact: Type.Optional(Type.Array(Impact, { description: "How the spec changes, one plain line each: sections added or changed, questions unlocked, new obligations. The Overview tab lists these for decided questions." })),
  specDelta: Type.Optional(
    Type.Record(Type.String(), Type.Integer({ minimum: -3, maximum: 3 }), {
      description: "How far this option moves the spec along each of the session's spec dimensions, keyed by dimension id; omit a dimension it leaves alone. The Overview tab sums these for decided questions.",
    }),
  ),
};
const Question = Type.Object({
  id: Type.String({ description: "Stable decision id, e.g. D7. Reuse it to re-ask a reopened decision." }),
  header: Type.String({ description: "Short decision tag." }),
  title: Type.String({ description: "The question, phrased so each option is a direct answer. Plain words; define any term the user has not seen." }),
  prerequisites: Type.Optional(Type.Array(Type.String({ description: "Decision ids this depends on." }))),
  lenses: Type.Array(Type.Object({ id: Type.String(), label: Type.String(), kind: LensKind }), {
    description: "2-4 views that make this decision clear: diff for code, mermaid ER plus data/query for data models, sequence for interactions.",
  }),
  dimensions: Type.Array(Type.Object({ id: Type.String(), label: Type.String(), hint: Type.Optional(Type.String()) }), { description: "What this decision actually trades between." }),
  options: Type.Array(Type.Object({ id: Type.String(), label: Type.String(), recommended: Type.Optional(Type.Boolean()), ...OptionFields })),
});

const SpecDimension = Type.Object({
  id: Type.String({ description: "Short stable id, e.g. downtime." }),
  label: Type.String({ description: "What the axis measures, as the chart shows it, e.g. 'Migration downtime'." }),
  hint: Type.Optional(Type.String()),
  direction: Type.Optional(Type.Union([Type.Literal("cost"), Type.Literal("benefit")], { description: "cost (default): a positive delta adds work or risk. benefit: a positive delta is a gain." })),
});

const ask = defineSurfaceTool({
  name: "surface_forge_ask",
  label: "Forge ask",
  opens: true,
  description:
    "Post a frontier round of design decisions to the forge page, a live browser page, in one call; the turn ends after it. " +
    "Answers and defers come back together as one 'Surface · forge · round N complete' message once every question in the round is settled; follow-ups and revisits arrive as they happen. " +
    "Every option must supply pros and cons, every lens (kind 'na' with a reason if it has nothing to show), and a score with a reason for every dimension.",
  promptSnippet: "surface_forge_ask: post a round of design decisions with visuals and trade-offs to the forge page",
  parameters: Type.Object({
    questions: Type.Array(Question, { minItems: 1, description: "Every question of the frontier round." }),
    specDimensions: Type.Optional(
      Type.Array(SpecDimension, {
        description:
          "Spec dimensions to add to this session, or to update by id: the axes this particular solution's spec moves along. Declare them in the first round and add more in any later round; every specDelta key must name one.",
      }),
    ),
  }),
  async run(session: ForgeSession, params) {
    const url = await session.askRound(params.questions, params.specDimensions);
    const ids = params.questions.map((q) => q.id);
    return {
      text: `Posted round ${session.state.round} (${ids.join(", ")}) to the forge page: ${url}\nDo not wait or poll; the answers arrive together as one message.`,
      details: { questionIds: ids, url },
      terminate: true,
    };
  },
});

const reply = defineSurfaceTool({
  name: "surface_forge_reply",
  label: "Forge reply",
  description:
    "Answer a forge follow-up in that question's thread. Optionally revise one option (description, pros, cons, visuals, scores, impact, specDelta) when the answer changes it. Does not answer the question; it stays open.",
  parameters: Type.Object({
    questionId: Type.String(),
    text: Type.String({ description: "Short markdown-free reply." }),
    optionId: Type.Optional(Type.String({ description: "The option the reply is about." })),
    revise: Type.Optional(Type.Object(Object.fromEntries(Object.entries(OptionFields).map(([k, v]) => [k, Type.Optional(v)])))),
  }),
  run(session: ForgeSession, params) {
    session.reply(params.questionId, params.text, params.optionId, params.revise);
    return { text: `Replied in ${params.questionId}'s thread.`, details: { questionId: params.questionId } };
  },
});

const rfc = defineSurfaceTool({
  name: "surface_forge_rfc",
  label: "Forge RFC",
  description:
    "Record that the user asked in chat for an RFC alongside the tech spec, or withdrew that request, so the forge page shows it. " +
    "Requests made on the page arrive as 'Surface · forge · RFC' messages and need no call.",
  parameters: Type.Object({ requested: Type.Boolean() }),
  run(session: ForgeSession, params) {
    session.setRfcRequested(params.requested);
    return { text: `RFC ${params.requested ? "requested" : "withdrawn"} on the forge page.`, details: { requested: params.requested } };
  },
});

const draft = defineSurfaceTool({
  name: "surface_forge_draft",
  label: "Forge draft",
  description:
    "Show a tech spec or RFC on the forge page's Overview. An interim draft is written from the decisions so far: mark what cannot be written yet with TBD(D4): what is missing, naming open or deferred decision ids, or TBD: what is missing when no question covers it yet. " +
    "A final draft (final true, with the path of the file you wrote) asks the user to approve it on the page; their verdict arrives as a 'Surface · forge ·' message. Replaces the previous draft of that kind. Answers no question.",
  parameters: Type.Object({
    kind: Type.Union([Type.Literal("spec"), Type.Literal("rfc")], { description: "spec for the tech spec, rfc for the RFC." }),
    markdown: Type.String({ description: "The whole draft as markdown." }),
    final: Type.Optional(Type.Boolean({ description: "True when this is the finished draft for the user to approve." })),
    path: Type.Optional(Type.String({ description: "The file the final draft was written to." })),
  }),
  run(session: ForgeSession, params) {
    session.postDraft(params.kind, params.markdown, { final: params.final, path: params.path });
    const tbds = params.markdown.match(/\bTBD\b/g)?.length ?? 0;
    if (params.final) {
      return { text: `Posted the final ${params.kind} for approval on the forge Overview. End your turn; the user's verdict arrives as a message.`, details: { kind: params.kind, tbds }, terminate: true };
    }
    return { text: `Posted the ${params.kind} draft to the forge Overview (${tbds} TBD${tbds === 1 ? "" : "s"}).`, details: { kind: params.kind, tbds } };
  },
});

export default defineWorkflow<ForgeState, ForgeAction, ForgeSession>({
  id: "forge",
  title: "forge",
  emptyState: () => emptyState(),
  parseAction,
  tools: [ask, reply, rfc, draft],
  create: (ctx) => new ForgeSession(ctx),
});
