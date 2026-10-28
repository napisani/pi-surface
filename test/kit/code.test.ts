import assert from "node:assert/strict";
import { test } from "node:test";
import { checkRef, sideOf, validateVisual, type Visual } from "../../src/kit/code.ts";

test("every visual kind validates, and listed visuals need a label", () => {
  const visuals: Visual[] = [
    { kind: "mermaid", source: "flowchart LR" },
    { kind: "data", tables: [{ headers: ["a"], rows: [["1"]] }] },
    { kind: "query", command: "select 1", result: { headers: [], rows: [] } },
    { kind: "callTree", text: "a\n  b" },
    { kind: "code", text: "x" },
    { kind: "diff", unified: "+x" },
    { kind: "na", reason: "nothing changes" },
  ];
  for (const v of visuals) {
    assert.deepEqual(validateVisual(v, "v"), [], v.kind);
  }
  assert.deepEqual(validateVisual({ kind: "data", tables: [] }, "v"), ["v: data visual needs at least one table"]);
  assert.deepEqual(validateVisual({ kind: "code", text: "x" }, "v", { label: true }), ["v: a visual needs a label"]);
});

test("a code ref names a safe path, a revision the page can read, and real lines", () => {
  assert.equal(sideOf("base"), "LEFT");
  assert.equal(sideOf("work"), "RIGHT");
  checkRef({ path: "src/a.ts", rev: "head", startLine: 1, endLine: 2 }, "ref", ["base", "head"]);
  assert.throws(() => checkRef({ path: "src/a.ts", rev: "work", startLine: 1, endLine: 1 }, "ref", ["base", "head"]), /rev must be one of base, head/);
  assert.throws(() => checkRef({ path: "../x", rev: "head", startLine: 1, endLine: 1 }, "ref"), /not a repository-relative path/);
  assert.throws(() => checkRef({ path: "-rf", rev: "head", startLine: 1, endLine: 1 }, "ref"), /not a repository-relative path/);
  assert.throws(() => checkRef({ path: "a", rev: "head", startLine: 3, endLine: 2 }, "ref"), /1 <= start <= end/);
});
