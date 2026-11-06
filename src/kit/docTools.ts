// The agent tool that answers a workflow's document comments.
import { Type } from "typebox";
import { defineSurfaceTool, type SurfaceTool } from "../host/workflow.ts";
import type { CommentUpdate } from "./docComments.ts";

export interface DocSession {
  answerDocComments(kind: string, id: string, updates: CommentUpdate[]): void;
}

export function docTools<Sess extends DocSession>(workflow: string): SurfaceTool<Sess>[] {
  return [
    defineSurfaceTool({
      name: `surface_${workflow}_doc_comments`,
      label: "Document comments",
      description:
        "After revising a document for the user's inline comments, answer every comment you were sent: done (what changed), declined (why not) or needs-input (your question). Revise the document itself with the tool that publishes it first.",
      parameters: Type.Object({
        docKind: Type.String(),
        docId: Type.String(),
        updates: Type.Array(
          Type.Object({
            commentId: Type.String({ description: "e.g. K4" }),
            status: Type.Union([Type.Literal("done"), Type.Literal("declined"), Type.Literal("needs-input")]),
            reply: Type.String({ description: "One plain line." }),
          }),
          { minItems: 1 },
        ),
      }),
      run(session: Sess, params) {
        session.answerDocComments(params.docKind, params.docId, params.updates);
        return { text: `Answered ${params.updates.length} comment${params.updates.length === 1 ? "" : "s"}. End your turn.`, details: { count: params.updates.length }, terminate: true };
      },
    }),
  ];
}
