import { SurfaceError } from "../host/workflow.ts";
import { MAX_VIEW_HTML } from "./sandbox.ts";
import { parseWireframe } from "./wireframe.ts";

/**
 * Which version of a file to read: the merge base, the head under review, the
 * commit a changes view compares against, or the working tree on disk.
 */
export type Rev = "base" | "head" | "since" | "work";
export const REVS: readonly Rev[] = ["base", "head", "since", "work"];

/** GitHub's names for the two sides of a diff; used only where GitHub requires them. */
export type Side = "LEFT" | "RIGHT";

/** A line or line range a GitHub comment or change request attaches to. */
export interface Anchor {
  path: string;
  side: Side;
  line: number;
  startLine?: number;
}

/** A stretch of code at one revision; may be outside the diff's files. */
export interface CodeRef {
  path: string;
  rev: Rev;
  startLine: number;
  endLine: number;
  note?: string;
}

/** The diff side a revision's lines sit on. */
export const sideOf = (rev: Rev): Side => (rev === "base" ? "LEFT" : "RIGHT");

/** The diff line range a code ref covers: its side, last line, and first line when it spans several. */
export function anchorOf(ref: CodeRef): Anchor {
  const anchor: Anchor = { path: ref.path, side: sideOf(ref.rev), line: ref.endLine };
  if (ref.startLine < ref.endLine) {
    anchor.startLine = ref.startLine;
  }
  return anchor;
}

export interface DataTable {
  caption?: string;
  headers: string[];
  rows: string[][];
  highlight?: Record<string, "good" | "bad">;
}

interface VisualCommon {
  look?: string;
  stat?: string;
}

/** How a graph node reads: its state in a plan, or a change in an architecture. */
export type GraphTone = "open" | "active" | "done" | "blocked" | "fog" | "warn" | "bad" | "added" | "removed" | "muted";
export const GRAPH_TONES: readonly GraphTone[] = ["open", "active", "done", "blocked", "fog", "warn", "bad", "added", "removed", "muted"];

export interface GraphNode {
  id: string;
  label: string;
  /** Nodes of one group sit together within their column. */
  group?: string;
  tone?: GraphTone;
  /** Shown on hover. */
  note?: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  label?: string;
  dashed?: boolean;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export type CellTone = "good" | "bad" | "warn";

export interface MatrixCell {
  value: string;
  tone?: CellTone;
  note?: string;
}

export interface MachineState {
  id: string;
  label: string;
  initial?: boolean;
  final?: boolean;
  /** A state the system should never reach. */
  bad?: boolean;
}

export interface MachineTransition {
  from: string;
  to: string;
  event: string;
  /** A transition that leads somewhere wrong; the finding is about it. */
  bad?: boolean;
}

export type Visual =
  | (VisualCommon & { kind: "callTree"; text: string })
  | (VisualCommon & { kind: "diff"; unified: string })
  | (VisualCommon & { kind: "code"; lang?: string; text: string })
  | (VisualCommon & { kind: "mermaid"; source: string })
  | (VisualCommon & { kind: "data"; tables: DataTable[]; code?: { lang?: string; text: string } })
  | (VisualCommon & { kind: "query"; lang?: string; command: string; result: DataTable })
  | (VisualCommon & ({ kind: "graph" } & Graph))
  | (VisualCommon & { kind: "matrix"; rows: string[]; columns: string[]; cells: MatrixCell[][] })
  | (VisualCommon & { kind: "stateMachine"; states: MachineState[]; transitions: MachineTransition[] })
  | (VisualCommon & { kind: "archDiff"; before: Graph; after: Graph; changed?: string[] })
  | (VisualCommon & { kind: "wireframe"; source: string })
  | (VisualCommon & { kind: "heatmap"; rows: string[]; columns: string[]; values: number[][] })
  | (VisualCommon & { kind: "view"; html: string; data?: unknown; height?: number })
  | (VisualCommon & { kind: "na"; reason: string });

export type VisualKind = Visual["kind"];

/** A visual shown in a list of tabs, so it needs a tab label. */
export type LabeledVisual = Visual & { label: string };

function graphProblem(graph: Graph | undefined, what: string): string | undefined {
  if (!graph?.nodes?.length) {
    return `${what} needs at least one node`;
  }
  const ids = new Set<string>();
  for (const node of graph.nodes) {
    if (!node.id?.trim() || !node.label?.trim()) {
      return `${what}: every node needs an id and a label`;
    }
    if (ids.has(node.id)) {
      return `${what}: node id "${node.id}" appears twice`;
    }
    if (node.tone !== undefined && !GRAPH_TONES.includes(node.tone)) {
      return `${what}: node "${node.id}" tone must be one of ${GRAPH_TONES.join(", ")}`;
    }
    ids.add(node.id);
  }
  const loose = (graph.edges ?? []).find((e) => !ids.has(e.from) || !ids.has(e.to));
  return loose ? `${what}: edge ${loose.from} -> ${loose.to} names a node that does not exist` : undefined;
}

function gridProblem(rows: string[], columns: string[], grid: unknown[][] | undefined, what: string): string | undefined {
  if (!rows?.length || !columns?.length) {
    return `${what} needs at least one row and one column`;
  }
  if (grid?.length !== rows.length || grid.some((row) => row?.length !== columns.length)) {
    return `${what} needs one row of ${columns.length} per row label (${rows.length})`;
  }
  return undefined;
}

function machineProblem(states: MachineState[], transitions: MachineTransition[]): string | undefined {
  if (!states?.length) {
    return "stateMachine visual needs at least one state";
  }
  if (states.filter((st) => st.initial).length !== 1) {
    return "stateMachine visual needs exactly one initial state";
  }
  const ids = new Set(states.map((st) => st.id));
  const loose = (transitions ?? []).find((t) => !ids.has(t.from) || !ids.has(t.to) || !t.event?.trim());
  return loose ? `stateMachine transition ${loose.from} -> ${loose.to} needs known states and an event` : undefined;
}

/** What a structured visual lacks, or undefined; the plain kinds are checked by missingPart. */
function structureProblem(visual: Visual): string | undefined {
  switch (visual.kind) {
    case "graph":
      return graphProblem(visual, "graph visual");
    case "matrix":
      return gridProblem(visual.rows, visual.columns, visual.cells, "matrix visual");
    case "heatmap":
      return gridProblem(visual.rows, visual.columns, visual.values, "heatmap visual") ?? (visual.values.flat().every((v) => Number.isFinite(v)) ? undefined : "heatmap values must be numbers");
    case "stateMachine":
      return machineProblem(visual.states, visual.transitions);
    case "archDiff":
      return graphProblem(visual.before, "archDiff before") ?? graphProblem(visual.after, "archDiff after");
    case "wireframe": {
      const { errors } = parseWireframe(visual.source ?? "");
      return errors.length ? `wireframe: ${errors.slice(0, 3).join("; ")}` : undefined;
    }
    case "view":
      if (!visual.html?.trim()) {
        return "view visual needs html";
      }
      return visual.html.length > MAX_VIEW_HTML ? `view html is limited to ${MAX_VIEW_HTML} characters` : undefined;
    default:
      return undefined;
  }
}

const STRUCTURED: ReadonlySet<VisualKind> = new Set(["graph", "matrix", "heatmap", "stateMachine", "archDiff", "wireframe", "view"]);

/** What a visual of its kind lacks, or undefined when it is complete. */
function missingPart(visual: Visual): string | undefined {
  return STRUCTURED.has(visual.kind) ? structureProblem(visual) : plainProblem(visual);
}

function plainProblem(visual: Visual): string | undefined {
  switch (visual.kind) {
    case "mermaid":
      return visual.source?.trim() ? undefined : "mermaid visual needs a source";
    case "data":
      return visual.tables?.length ? undefined : "data visual needs at least one table";
    case "query":
      return visual.command?.trim() ? undefined : "query visual needs a command";
    case "callTree":
    case "code":
      return visual.text?.trim() ? undefined : `${visual.kind} visual needs text`;
    case "diff":
      return visual.unified?.trim() ? undefined : "diff visual needs unified text";
    case "na":
      return visual.reason?.trim() ? undefined : "na visual needs a reason";
    default: {
      // Tool input that slipped past its schema can still carry a kind no case names.
      const other: { kind: string } = visual;
      return `unknown visual kind "${other.kind}"`;
    }
  }
}

/** Returns every problem with a visual, or none. */
export function validateVisual(visual: Visual, what: string, options: { label?: boolean } = {}): string[] {
  const errors: string[] = [];
  const label = "label" in visual ? String(visual.label ?? "") : "";
  if (options.label && !label.trim()) {
    errors.push(`${what}: a visual needs a label`);
  }
  const missing = missingPart(visual);
  if (missing) {
    errors.push(`${what}: ${missing}`);
  }
  return errors;
}

// No absolute paths, no leading dash (git would read an option), no . or .. segments.
const SAFE_PATH = /^(?!\/)(?!-)(?!.*(^|\/)\.\.?(\/|$))[^\0:]+$/;

export function checkPath(path: string, what: string): void {
  if (!SAFE_PATH.test(path)) {
    throw new SurfaceError(`${what}: "${path}" is not a repository-relative path`);
  }
}

export function checkLines(start: number, end: number, what: string): void {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
    throw new SurfaceError(`${what}: lines must be integers with 1 <= start <= end, got ${start}-${end}`);
  }
}

/** Checks a code ref's path and lines, and that its revision is one this workflow can read. */
export function checkRef(ref: CodeRef, what: string, revs: readonly Rev[] = REVS): void {
  checkPath(ref.path, what);
  if (!revs.includes(ref.rev)) {
    throw new SurfaceError(`${what}: rev must be one of ${revs.join(", ")}, got "${ref.rev}"`);
  }
  checkLines(ref.startLine, ref.endLine, what);
}

export function checkSide(side: Side, what: string): void {
  if (side !== "LEFT" && side !== "RIGHT") {
    throw new SurfaceError(`${what}: side must be LEFT or RIGHT`);
  }
}
