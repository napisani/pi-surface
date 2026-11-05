// Places a graph's nodes in columns, left to right: each node one column past
// its deepest predecessor, grouped within its column. Pure, so the Node tests cover it.
import type { Graph } from "../../src/kit/code.ts";

export const NODE_H = 30;
const COL_GAP = 56;
const ROW_GAP = 12;
const PAD = 8;
const CHAR_W = 6.6;
const MIN_W = 84;
const MAX_W = 200;

export interface PlacedNode {
  id: string;
  x: number;
  y: number;
  w: number;
}

export interface PlacedEdge {
  from: string;
  to: string;
  /** An SVG path from the source's right edge to the target's left edge. */
  path: string;
  /** Where its label sits. */
  mid: { x: number; y: number };
}

export interface GraphLayout {
  nodes: PlacedNode[];
  edges: PlacedEdge[];
  width: number;
  height: number;
}

export const nodeWidth = (label: string) => Math.round(Math.min(MAX_W, Math.max(MIN_W, label.length * CHAR_W + 22)));

/** Edges that close a cycle, found walking from nodes in input order; dropping them leaves a DAG. */
function backEdges(graph: Graph, ids: ReadonlySet<string>): Set<string> {
  const outgoing = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (ids.has(e.from) && ids.has(e.to)) {
      outgoing.set(e.from, [...(outgoing.get(e.from) ?? []), e.to]);
    }
  }
  const back = new Set<string>();
  const state = new Map<string, "open" | "done">();
  const walk = (id: string) => {
    state.set(id, "open");
    for (const to of outgoing.get(id) ?? []) {
      if (state.get(to) === "open") {
        back.add(`${id}>${to}`);
      } else if (!state.has(to)) {
        walk(to);
      }
    }
    state.set(id, "done");
  };
  for (const node of graph.nodes) {
    if (!state.has(node.id)) {
      walk(node.id);
    }
  }
  return back;
}

/** The longest path to each node from a source, ignoring edges that close a cycle. */
function depths(graph: Graph): Map<string, number> {
  const ids = new Set(graph.nodes.map((n) => n.id));
  const back = backEdges(graph, ids);
  const incoming = new Map<string, string[]>([...ids].map((id) => [id, []]));
  for (const e of graph.edges) {
    if (e.from !== e.to && ids.has(e.from) && ids.has(e.to) && !back.has(`${e.from}>${e.to}`)) {
      incoming.get(e.to)!.push(e.from);
    }
  }
  const depth = new Map<string, number>();
  const visit = (id: string): number => {
    const known = depth.get(id);
    if (known !== undefined) {
      return known;
    }
    const d = Math.max(-1, ...incoming.get(id)!.map(visit)) + 1;
    depth.set(id, d);
    return d;
  };
  ids.forEach(visit);
  return depth;
}

export function layoutGraph(graph: Graph): GraphLayout {
  const depth = depths(graph);
  const columns: string[][] = [];
  const order = new Map(graph.nodes.map((n, i) => [n.id, i]));
  const groupOf = new Map(graph.nodes.map((n) => [n.id, n.group ?? ""]));
  for (const node of graph.nodes) {
    (columns[depth.get(node.id)!] ??= []).push(node.id);
  }
  const widths = new Map(graph.nodes.map((n) => [n.id, nodeWidth(n.label)]));
  const placed = new Map<string, PlacedNode>();
  let x = PAD;
  let height = 0;
  for (const column of columns) {
    if (!column) {
      continue;
    }
    column.sort((a, b) => groupOf.get(a)!.localeCompare(groupOf.get(b)!) || order.get(a)! - order.get(b)!);
    const w = Math.max(...column.map((id) => widths.get(id)!));
    column.forEach((id, row) => placed.set(id, { id, x, y: PAD + row * (NODE_H + ROW_GAP), w: widths.get(id)! }));
    height = Math.max(height, PAD * 2 + column.length * (NODE_H + ROW_GAP) - ROW_GAP);
    x += w + COL_GAP;
  }
  const edges: PlacedEdge[] = [];
  for (const e of graph.edges) {
    const a = placed.get(e.from);
    const b = placed.get(e.to);
    if (!a || !b) {
      continue;
    }
    const [x1, y1, x2, y2] = [a.x + a.w, a.y + NODE_H / 2, b.x, b.y + NODE_H / 2];
    // A back edge (same column or leftward) loops below its nodes so it stays visible.
    const back = x2 <= x1;
    const bend = back ? Math.max(a.y, b.y) + NODE_H + 18 : 0;
    const path = back
      ? `M${x1},${y1} C${x1 + 30},${bend} ${x2 - 30},${bend} ${x2},${y2}`
      : `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`;
    edges.push({ from: e.from, to: e.to, path, mid: { x: (x1 + x2) / 2, y: back ? bend - 4 : (y1 + y2) / 2 - 4 } });
    height = Math.max(height, back ? bend + PAD : 0);
  }
  return { nodes: [...placed.values()], edges, width: Math.max(x - COL_GAP + PAD, 120), height: Math.max(height, NODE_H + PAD * 2) };
}
