import { Type } from "typebox";
import { defineSurfaceTool, defineWorkflow } from "../../../src/host/workflow.ts";
import { LabeledVisual, Score } from "../../../src/kit/schemas.ts";
import { parseAction, type EntropyAction } from "./actions.ts";
import { EntropySession } from "./session.ts";
import { CONCESSIONS, emptyState, ENTROPY_DIMENSIONS, type EntropyState } from "./state.ts";

const dimensionList = ENTROPY_DIMENSIONS.map((d) => `${d.id} (${d.label}: ${d.hint})`).join("; ");

const FindingFields = {
  title: Type.String({ maxLength: 280, description: "The simplification in a few words, e.g. 'Parse only ISO dates'." }),
  givesUp: Type.String({ maxLength: 280, description: "What accepting gives up and who would notice, in one plain sentence. 'Nothing' when the concession is none." }),
  simplification: Type.String({ maxLength: 280, description: "What the code becomes, in one or two plain sentences." }),
  recommended: Type.Union([Type.Literal("accept"), Type.Literal("decline")], { description: "accept when the payoff clearly earns the concession." }),
  lines: Type.Integer({ minimum: 0, description: "Net lines removed when accepted, counted from the code." }),
  concepts: Type.Array(Type.String(), { description: "Each type, file, option, layer or dependency that disappears, by name." }),
  pros: Type.Array(Type.String({ maxLength: 100 }), { minItems: 1, description: "What accepting buys, one short phrase each." }),
  cons: Type.Array(Type.String({ maxLength: 100 }), { minItems: 1, description: "What accepting costs or risks, one short phrase each." }),
  visuals: Type.Array(LabeledVisual, { minItems: 1, maxItems: 3, description: "First the before/after diff (kind diff) against the real files; then at most two more views that make the finding obvious." }),
  scores: Type.Record(Type.String(), Score, { description: `Accepting, scored 1-5 on every axis, 5 = better: ${dimensionList}. Declining is drawn as the fixed baseline.` }),
};

const Finding = Type.Object({
  id: Type.String({ description: "F1, F2, … in report order; reuse an id only to replace an open finding." }),
  concession: Type.Union(CONCESSIONS.map((c) => Type.Literal(c)), { description: "none: nobody notices. internal: maintainers and internal callers. edge: users in rare cases. feature: users routinely." }),
  after: Type.Optional(Type.Array(Type.String(), { description: "Findings this one is written against, as their answers leave the code." })),
  ...FindingFields,
});

const findings = defineSurfaceTool({
  name: "surface_entropy_findings",
  label: "Entropy findings",
  opens: true,
  description:
    "Post reduce-entropy findings to the entropy page, a live browser page, in one call; the turn ends after it. " +
    "The user accepts or declines each, then sends them all at once; that arrives as one 'Surface · entropy · decisions sent' message. Follow-ups arrive as they happen. " +
    "A later call adds findings that waited on earlier decisions.",
  promptSnippet: "surface_entropy_findings: post simplification findings for the user to accept or decline on the entropy page",
  parameters: Type.Object({
    scope: Type.Optional(Type.String({ description: "What was analyzed, one line, e.g. 'src/config/ at main' or 'branch feat/x vs main'. Required on the first call." })),
    findings: Type.Array(Finding, { minItems: 1, description: "In report order: concession size, smallest first; within a size, largest payoff first." }),
  }),
  async run(session: EntropySession, params) {
    const url = await session.post(params.scope, params.findings);
    const ids = params.findings.map((f) => f.id);
    return {
      text: `Posted ${ids.join(", ")} to the entropy page: ${url}\nDo not wait or poll; the decisions arrive together as one message.`,
      details: { findingIds: ids, url },
      terminate: true,
    };
  },
});

const reply = defineSurfaceTool({
  name: "surface_entropy_reply",
  label: "Entropy reply",
  description: "Answer a follow-up in that finding's thread. Optionally revise the finding when the answer changes it. Does not decide it.",
  parameters: Type.Object({
    findingId: Type.String(),
    text: Type.String({ description: "Short markdown reply." }),
    revise: Type.Optional(Type.Object(Object.fromEntries(Object.entries(FindingFields).map(([k, v]) => [k, Type.Optional(v)])))),
  }),
  run(session: EntropySession, params) {
    session.reply(params.findingId, params.text, params.revise);
    return { text: `Replied in ${params.findingId}'s thread.`, details: { findingId: params.findingId } };
  },
});

export default defineWorkflow<EntropyState, EntropyAction, EntropySession>({
  id: "entropy",
  title: "entropy",
  emptyState,
  parseAction,
  tools: [findings, reply],
  create: (ctx) => new EntropySession(ctx),
});
