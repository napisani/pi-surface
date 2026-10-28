// TypeBox schemas for kit types that appear in tool parameters.
import { Type } from "typebox";

export const Table = Type.Object({
  caption: Type.Optional(Type.String()),
  headers: Type.Array(Type.String()),
  rows: Type.Array(Type.Array(Type.String())),
  highlight: Type.Optional(Type.Record(Type.String(), Type.Union([Type.Literal("good"), Type.Literal("bad")]), { description: "Row index -> good|bad" })),
});

const common = { look: Type.Optional(Type.String({ description: "One line telling the user what to notice." })), stat: Type.Optional(Type.String()) };
const label = { label: Type.String({ description: "Tab label, e.g. 'Request flow'." }) };

function visualKinds(extra: Record<string, ReturnType<typeof Type.String>>) {
  const fields = { ...common, ...extra };
  return [
    Type.Object({ kind: Type.Literal("mermaid"), source: Type.String({ description: "Mermaid source: flowchart, sequenceDiagram, erDiagram, stateDiagram." }), ...fields }),
    Type.Object({ kind: Type.Literal("data"), tables: Type.Array(Table), code: Type.Optional(Type.Object({ lang: Type.Optional(Type.String()), text: Type.String() })), ...fields }),
    Type.Object({ kind: Type.Literal("query"), lang: Type.Optional(Type.String()), command: Type.String(), result: Table, ...fields }),
    Type.Object({ kind: Type.Literal("callTree"), text: Type.String(), ...fields }),
    Type.Object({ kind: Type.Literal("code"), lang: Type.Optional(Type.String()), text: Type.String({ description: "Code; prefix lines with + or - to mark a proposed change." }), ...fields }),
    Type.Object({ kind: Type.Literal("diff"), unified: Type.String({ description: "Lines prefixed '+', '-', ' '; '### path' starts a file, '@@' a hunk." }), ...fields }),
  ];
}

/** A visual in a list of tabs: findings, answers, walkthrough steps. */
export const LabeledVisual = Type.Union(visualKinds(label));

/** A visual keyed by a lens, which may have nothing to show. */
export const LensVisual = Type.Union([...visualKinds({}), Type.Object({ kind: Type.Literal("na"), reason: Type.String(), ...common })]);

export const Rev = Type.Union([Type.Literal("base"), Type.Literal("head"), Type.Literal("since"), Type.Literal("work")], {
  description: "base is the merge base; head is the PR head or the commit under review; work is the working tree; since is the commit the Changes tab compares against (feedback only).",
});

export const Side = Type.Union([Type.Literal("LEFT"), Type.Literal("RIGHT")], { description: "RIGHT is the head or working tree, LEFT the merge base (removed lines)." });

export function codeRefSchema(pathDescription: string, noteDescription: string) {
  return Type.Object({
    path: Type.String({ description: pathDescription }),
    rev: Rev,
    startLine: Type.Integer({ minimum: 1 }),
    endLine: Type.Integer({ minimum: 1 }),
    note: Type.Optional(Type.String({ description: noteDescription })),
  });
}

export const Anchor = Type.Object(
  {
    path: Type.String({ description: "A file in the diff." }),
    side: Side,
    line: Type.Integer({ minimum: 1, description: "Last line of the commented range, on that side." }),
    startLine: Type.Optional(Type.Integer({ minimum: 1, description: "First line of a multi-line range." })),
  },
  { description: "A line or range in the diff. For GitHub comments it must sit inside a diff hunk." },
);
