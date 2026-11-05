// TypeBox schemas for kit types that appear in tool parameters.
import { Type } from "typebox";

export const Table = Type.Object({
  caption: Type.Optional(Type.String()),
  headers: Type.Array(Type.String()),
  rows: Type.Array(Type.Array(Type.String())),
  highlight: Type.Optional(Type.Record(Type.String(), Type.Union([Type.Literal("good"), Type.Literal("bad")]), { description: "Row index -> good|bad" })),
});

const Tone = Type.Union(["open", "active", "done", "blocked", "fog", "warn", "bad", "added", "removed", "muted"].map((t) => Type.Literal(t)));
const GraphNode = Type.Object({
  id: Type.String(),
  label: Type.String({ description: "Short; long labels are cut." }),
  group: Type.Optional(Type.String({ description: "Nodes of one group sit together." })),
  tone: Type.Optional(Tone),
  note: Type.Optional(Type.String({ description: "Shown on hover." })),
});
const GraphEdge = Type.Object({ from: Type.String(), to: Type.String(), label: Type.Optional(Type.String()), dashed: Type.Optional(Type.Boolean()) });
export const Graph = Type.Object({ nodes: Type.Array(GraphNode), edges: Type.Array(GraphEdge, { description: "from -> to; drawn left to right." }) });
const CellTone = Type.Union([Type.Literal("good"), Type.Literal("bad"), Type.Literal("warn")]);

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
    Type.Object({ kind: Type.Literal("graph"), ...Graph.properties, ...fields }, { description: "Nodes and edges with status tones: dependencies, plans, flows." }),
    Type.Object(
      {
        kind: Type.Literal("matrix"),
        rows: Type.Array(Type.String(), { description: "Row labels, e.g. the options." }),
        columns: Type.Array(Type.String(), { description: "Column labels, e.g. the criteria." }),
        cells: Type.Array(Type.Array(Type.Object({ value: Type.String(), tone: Type.Optional(CellTone), note: Type.Optional(Type.String()) })), { description: "One row per row label, one cell per column." }),
        ...fields,
      },
      { description: "Options compared by criteria; the user can sort by a column." },
    ),
    Type.Object(
      {
        kind: Type.Literal("stateMachine"),
        states: Type.Array(Type.Object({ id: Type.String(), label: Type.String(), initial: Type.Optional(Type.Boolean()), final: Type.Optional(Type.Boolean()), bad: Type.Optional(Type.Boolean()) }), { description: "Exactly one initial state." }),
        transitions: Type.Array(Type.Object({ from: Type.String(), to: Type.String(), event: Type.String(), bad: Type.Optional(Type.Boolean()) })),
        ...fields,
      },
      { description: "States the user steps through by firing events; mark the bad state or transition." },
    ),
    Type.Object(
      { kind: Type.Literal("archDiff"), before: Graph, after: Graph, changed: Type.Optional(Type.Array(Type.String(), { description: "Ids present in both whose role or contract changes." })), ...fields },
      { description: "Current and target architecture; nodes only in after read as added, only in before as removed." },
    ),
    Type.Object(
      {
        kind: Type.Literal("wireframe"),
        source: Type.String({
          description:
            'Low-fidelity UI sketch. One part per line, two-space indent nests: kind, "quoted label", flags, key=value, #id. Kinds: panel header row stack card box grid title text button badge disclosure list tabs nav input image fill lines icon divider note. w=1..12 is a share of a row; grid cols=2..6; lines n=; repeat=; list/tabs/nav hold "- item" lines; nav vertical active=2.',
        }),
        ...fields,
      },
      { description: "The shape of a screen, not its copy." },
    ),
    Type.Object(
      {
        kind: Type.Literal("heatmap"),
        rows: Type.Array(Type.String()),
        columns: Type.Array(Type.String()),
        values: Type.Array(Type.Array(Type.Number()), { description: "One row per row label; higher is hotter." }),
        ...fields,
      },
      { description: "Where change or risk concentrates, e.g. modules by slices." },
    ),
    Type.Object(
      {
        kind: Type.Literal("view"),
        html: Type.String({
          description:
            "A self-contained interactive HTML page (inline <script> and <style> only, no network). It runs sandboxed: it cannot reach the page, the server or the network. Data arrives as window.surfaceData and a 'surface-data' event. Use only when no other kind fits.",
        }),
        data: Type.Optional(Type.Unknown({ description: "JSON handed to the view." })),
        height: Type.Optional(Type.Integer({ minimum: 120, maximum: 1600, description: "Initial height in pixels; the view resizes itself." })),
        ...fields,
      },
      { description: "A bespoke interactive explorer for a question no other kind answers." },
    ),
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

/** Every visual kind a decision's lens can show; na is the per-option escape. */
export const LensKind = Type.Union(["callTree", "diff", "code", "mermaid", "data", "query", "graph", "matrix", "stateMachine", "archDiff", "wireframe", "heatmap", "view"].map((k) => Type.Literal(k)));
export const Lens = Type.Object({ id: Type.String(), label: Type.String(), kind: LensKind });
export const Dimension = Type.Object({ id: Type.String(), label: Type.String(), hint: Type.Optional(Type.String()) });
export const Score = Type.Object({ value: Type.Integer({ minimum: 1, maximum: 5 }), why: Type.String() });

/** The fields every option of a decision carries, wherever the decision is asked. */
export const OptionFields = {
  description: Type.String({ maxLength: 280, description: "One or two plain sentences, at most 280 characters: what changes and what it costs. No undefined jargon, flag names, or file names." }),
  pros: Type.Array(Type.String({ maxLength: 100 }), { minItems: 1, description: "One short phrase (at most 100 characters) per advantage over the other options." }),
  cons: Type.Array(Type.String({ maxLength: 100 }), { minItems: 1, description: "One short phrase (at most 100 characters) per cost or risk relative to the other options." }),
  visuals: Type.Record(Type.String(), LensVisual, { description: "One entry per lens id." }),
  scores: Type.Record(Type.String(), Score, { description: "One entry per dimension id; 1-5, relative to the other options, 5 = best." }),
};
