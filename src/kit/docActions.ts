// The page actions for commenting on and editing a workflow's documents.
import { Type, type Static, type TProperties } from "typebox";
import type { PatchOp } from "../host/patch.ts";
import { SurfaceError } from "../host/workflow.ts";
import { addDocComment, commentsMessage, deleteDocComment, followUpDocComment, nextCommentId, sendDocComments, type DocComment, type DocTarget } from "./docComments.ts";

const Id = Type.String({ minLength: 1, maxLength: 200 });
const Text = Type.String({ minLength: 1, maxLength: 20_000 });
const Doc = { docKind: Id, docId: Id };
const action = <T extends string, P extends TProperties>(type: T, properties: P) => Type.Object({ type: Type.Literal(type), ...Doc, ...properties });

export const DOC_ACTIONS = {
  "doc.comment": action("doc.comment", {
    anchor: Type.Object({ quote: Type.String({ minLength: 1, maxLength: 2000 }), prefix: Type.String({ maxLength: 200 }), suffix: Type.String({ maxLength: 200 }) }),
    text: Text,
  }),
  "doc.comment.delete": action("doc.comment.delete", { commentId: Id }),
  "doc.comment.followUp": action("doc.comment.followUp", { commentId: Id, text: Text }),
  "doc.comments.send": action("doc.comments.send", {}),
  "doc.edit": action("doc.edit", {
    markdown: Type.String({ maxLength: 400_000 }),
    base: Type.Optional(Type.String({ maxLength: 400_000, description: "The editor's text when editing began, so formatting the editor normalized does not count as the user's change." })),
  }),
};

export type DocAction = Static<(typeof DOC_ACTIONS)[keyof typeof DOC_ACTIONS]>;

export const isDocAction = (a: { type: string }): a is DocAction => a.type in DOC_ACTIONS;

/** What a workflow supplies so the kit can resolve its document actions. */
export interface DocScope<S> {
  doc(kind: string, id: string): DocTarget<S>;
  /** Every comment on every document, so ids stay unique across them. */
  allComments(): readonly DocComment[];
  /** The tool the agent answers comments with. */
  tool: string;
}

export interface DocResolution {
  ops: PatchOp[];
  message?: string;
  /** The user changed the document's text: the session tells the agent, and may write a file. */
  edited?: { label: string; before: string; after: string };
}

export function resolveDocAction<S>(scope: DocScope<S>, a: DocAction, now: string): DocResolution {
  const doc = scope.doc(a.docKind, a.docId);
  switch (a.type) {
    case "doc.comment":
      return { ops: addDocComment(doc, nextCommentId(scope.allComments()), a.anchor, a.text.trim(), now).ops };
    case "doc.comment.delete":
      return { ops: deleteDocComment(doc, a.commentId) };
    case "doc.comment.followUp":
      return { ops: followUpDocComment(doc, a.commentId, a.text, now) };
    case "doc.comments.send": {
      const { ops, sent } = sendDocComments(doc);
      return { ops, message: commentsMessage(doc, a.docKind, a.docId, sent, scope.tool) };
    }
    case "doc.edit": {
      if (!doc.save) {
        throw new SurfaceError(`${doc.label} is read-only`);
      }
      if (a.markdown === doc.markdown) {
        return { ops: [] };
      }
      return { ops: doc.save(a.markdown, now), edited: { label: doc.label, before: a.base ?? doc.markdown, after: a.markdown } };
    }
  }
}

/** Headings whose section text changed between two versions, for telling the agent what the user edited. */
export function changedSections(before: string, after: string): string[] {
  const sections = (md: string) => {
    const map = new Map<string, string>();
    let heading = "(top)";
    for (const line of md.split("\n")) {
      const h = /^#{1,6}\s+(.*)$/.exec(line);
      if (h) {
        heading = h[1].trim();
      }
      map.set(heading, `${map.get(heading) ?? ""}${line}\n`);
    }
    return map;
  };
  const a = sections(before);
  const b = sections(after);
  return [...new Set([...a.keys(), ...b.keys()])].filter((k) => a.get(k) !== b.get(k));
}
