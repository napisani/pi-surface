import assert from "node:assert/strict";
import { test } from "node:test";
import { validateVisual, type Visual } from "../../src/kit/code.ts";
import { sandboxDocument, VIEW_POLICY } from "../../src/kit/sandbox.ts";
import { parseWireframe } from "../../src/kit/wireframe.ts";
import { layoutGraph } from "../../web/kit/graphLayout.ts";

test("a wireframe nests parts by two-space indent and collects list items", () => {
  const { parts, errors } = parseWireframe(['header flush', '  title "Plans"', '  button "New" primary', "row", "  nav vertical active=2", "    - Map", "    - Slices", "  stack w=8", "    lines n=3"].join("\n"));
  assert.deepEqual(errors, []);
  assert.deepEqual(parts.map((p) => p.kind), ["header", "row"]);
  assert.deepEqual(parts[0].children.map((c) => [c.kind, c.label, c.flags]), [
    ["title", "Plans", []],
    ["button", "New", ["primary"]],
  ]);
  const nav = parts[1].children[0];
  assert.deepEqual([nav.flags, nav.props.active, nav.items], [["vertical"], "2", ["Map", "Slices"]]);
  assert.equal(parts[1].children[1].props.w, "8");
});

test("wireframe errors name their line", () => {
  const { errors } = parseWireframe(['title', 'blob "x"', "   text", '- loose item', 'card repeat=40'].join("\n"));
  assert.deepEqual(errors, [
    'line 1: title needs a "quoted label"',
    'line 2: unknown part "blob"; use one of panel, header, row, stack, card, box, grid, title, text, button, badge, disclosure, list, tabs, nav, input, image, fill, lines, icon, divider, note',
    "line 3: indent with two spaces per level",
    'line 4: "- item" lines belong under a list, tabs or nav',
    "line 5: repeat must be 1-12",
  ]);
});

test("a sandboxed document puts the no-network policy before any agent markup", () => {
  const doc = sandboxDocument('<!DOCTYPE html><html><head><script>fetch("http://x")</script></head><body>hi</body></html>');
  assert.ok(doc.startsWith(`<!doctype html><meta http-equiv="Content-Security-Policy" content="${VIEW_POLICY}">`));
  assert.ok(doc.indexOf("Content-Security-Policy") < doc.indexOf('fetch("http://x")'));
  assert.equal((doc.match(/<!doctype/gi) ?? []).length, 1, "the agent's doctype is dropped");
  assert.match(VIEW_POLICY, /default-src 'none'/);
});

test("graph layout puts each node one column past its deepest predecessor, and survives cycles", () => {
  const layout = layoutGraph({
    nodes: [
      { id: "a", label: "a" },
      { id: "b", label: "b" },
      { id: "c", label: "c" },
      { id: "d", label: "d" },
    ],
    edges: [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
      { from: "a", to: "c" },
      { from: "c", to: "a" },
    ],
  });
  const x = Object.fromEntries(layout.nodes.map((n) => [n.id, n.x]));
  assert.ok(x.a < x.b && x.b < x.c, "a, then b, then c");
  assert.equal(x.d, x.a, "an unconnected node sits in the first column");
  assert.equal(layout.edges.length, 4);
});

test("structured visuals are checked for the parts they need", () => {
  const problems = (v: Visual) => validateVisual(v, "v");
  assert.deepEqual(problems({ kind: "graph", nodes: [{ id: "a", label: "A" }], edges: [{ from: "a", to: "z" }] }), ["v: graph visual: edge a -> z names a node that does not exist"]);
  assert.deepEqual(problems({ kind: "matrix", rows: ["x"], columns: ["c1", "c2"], cells: [[{ value: "1" }]] }), ["v: matrix visual needs one row of 2 per row label (1)"]);
  assert.deepEqual(problems({ kind: "stateMachine", states: [{ id: "s", label: "S" }], transitions: [] }), ["v: stateMachine visual needs exactly one initial state"]);
  assert.deepEqual(problems({ kind: "wireframe", source: "title" }), ['v: wireframe: line 1: title needs a "quoted label"']);
  assert.deepEqual(problems({ kind: "view", html: " " }), ["v: view visual needs html"]);
  assert.deepEqual(problems({ kind: "heatmap", rows: ["m"], columns: ["S1"], values: [[2]] }), []);
  assert.deepEqual(problems({ kind: "archDiff", before: { nodes: [{ id: "a", label: "A" }], edges: [] }, after: { nodes: [], edges: [] } }), ["v: archDiff after needs at least one node"]);
});
