// The two agent tools of a workflow's second opinions: publishing a review
// pass's findings, and reporting the author's corrections or replies.
import { Type } from "typebox";
import { defineSurfaceTool, type SurfaceTool } from "../host/workflow.ts";
import type { FindingInput, OpinionUpdate } from "./opinion.ts";

export interface OpinionSession {
  postOpinionFindings(opinionId: string, input: { findings: FindingInput[]; summary?: string; runId?: string } | { failed: string }): void;
  updateOpinion(opinionId: string, update: OpinionUpdate): void;
}

const Severity = Type.Union(["Critical", "High", "Medium", "Low"].map((s) => Type.Literal(s)));

export function opinionTools<Sess extends OpinionSession>(workflow: string): SurfaceTool<Sess>[] {
  const findings = defineSurfaceTool({
    name: `surface_${workflow}_opinion`,
    label: "Second opinion findings",
    description:
      "Publish a reviewer's findings for a second opinion the page asked for, unchanged, or report that the review failed. " +
      "The user triages them on the page; accepted ones come back as a corrections message. Do not act on findings here.",
    parameters: Type.Object({
      opinionId: Type.String({ description: "e.g. O2" }),
      findings: Type.Optional(
        Type.Array(
          Type.Object({
            severity: Severity,
            claim: Type.String({ description: "What is wrong, in one or two sentences." }),
            evidence: Type.Optional(Type.String({ description: "The text, code or fact that shows it." })),
            suggestion: Type.Optional(Type.String({ description: "What to change." })),
          }),
          { description: "Empty when the reviewer found nothing." },
        ),
      ),
      summary: Type.Optional(Type.String({ description: "The reviewer's overall verdict, one or two sentences." })),
      runId: Type.Optional(Type.String({ description: "The reviewer subagent's run id, so a later pass can resume it." })),
      failed: Type.Optional(Type.String({ description: "Why the review could not run; omit findings." })),
    }),
    run(session: Sess, params) {
      if (params.failed) {
        session.postOpinionFindings(params.opinionId, { failed: params.failed });
        return { text: `Marked ${params.opinionId} failed.`, details: { opinionId: params.opinionId } };
      }
      const list = params.findings ?? [];
      session.postOpinionFindings(params.opinionId, { findings: list, summary: params.summary, runId: params.runId });
      return { text: `Published ${list.length} finding${list.length === 1 ? "" : "s"} for ${params.opinionId}. End your turn; the user triages them.`, details: { opinionId: params.opinionId, count: list.length }, terminate: true };
    },
  });
  const update = defineSurfaceTool({
    name: `surface_${workflow}_opinion_update`,
    label: "Second opinion update",
    description:
      "Report the author's corrections for a second opinion's accepted findings (done or declined, one line each, with the target's text before and after), and/or answer the user's questions about findings.",
    parameters: Type.Object({
      opinionId: Type.String(),
      updates: Type.Optional(
        Type.Array(Type.Object({ findingId: Type.String({ description: "e.g. O2.3" }), status: Type.Union([Type.Literal("done"), Type.Literal("declined")]), reply: Type.String({ description: "What changed, or why not." }) })),
      ),
      before: Type.Optional(Type.String({ description: "The target's text before the corrections." })),
      after: Type.Optional(Type.String({ description: "The target's text after the corrections." })),
      replies: Type.Optional(Type.Array(Type.Object({ findingId: Type.String(), text: Type.String() }))),
    }),
    run(session: Sess, params) {
      session.updateOpinion(params.opinionId, params);
      return { text: `Updated ${params.opinionId} on the page. End your turn.`, details: { opinionId: params.opinionId }, terminate: true };
    },
  });
  return [findings, update];
}
