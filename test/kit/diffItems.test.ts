import { parsePatchFiles, type FileDiffMetadata } from "@pierre/diffs";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrFile } from "../../src/kit/git.ts";
import { buildDiffItems, lineAnnotation, stableLineItems, type LineItemMap } from "../../web/kit/diffItems.ts";

const file = (path: string): PrFile => ({ path, status: "modified", additions: 1, deletions: 1, binary: false, category: "impl", fingerprint: `fp-${path}` });
const diff = (name: string): FileDiffMetadata => parsePatchFiles(`diff --git a/${name} b/${name}\n--- a/${name}\n+++ b/${name}\n@@ -1 +1 @@\n-a\n+b\n`, name)[0].files[0];
const files = [file("a.ts"), file("b.ts"), file("bin.png")];
const patches = new Map([
  ["a.ts", diff("a.ts")],
  ["b.ts", diff("b.ts")],
]);

test("one diff item per file with a patch, keyed diff:<path>", () => {
  const items = buildDiffItems(files, patches, new Map(), new Set());
  assert.deepEqual(
    items.map((i) => [i.id, i.version]),
    [
      ["diff:a.ts", 1],
      ["diff:b.ts", 1],
    ],
  );
});

test("unchanged inputs reuse item objects; a change bumps only its item", () => {
  const lines: LineItemMap = new Map([["a.ts", [lineAnnotation("RIGHT", 3, "comment", "C1")]]]);
  const first = buildDiffItems(files, patches, lines, new Set());
  const again = buildDiffItems(files, patches, lines, new Set(), first);
  assert.equal(again[0], first[0]);
  assert.equal(again[1], first[1]);

  const collapsed = buildDiffItems(files, patches, lines, new Set(["b.ts"]), first);
  assert.equal(collapsed[0], first[0]);
  assert.equal(collapsed[1].version, 2);
  assert.equal(collapsed[1].collapsed, true);

  const moved: LineItemMap = new Map([["a.ts", [lineAnnotation("RIGHT", 4, "comment", "C1")]]]);
  const next = buildDiffItems(files, patches, moved, new Set(), first);
  assert.equal(next[0].version, 2);
  assert.equal(next[1], first[1]);
});

test("stableLineItems keeps the previous map until an annotation moves", () => {
  const build = (line: number) =>
    new Map([
      ["a.ts", [lineAnnotation("LEFT", line, "finding", "F1")]],
      ["b.ts", [lineAnnotation("RIGHT", 1, "request", "R1")]],
    ]);
  const first = stableLineItems(undefined, build(2));
  assert.equal(stableLineItems(first, build(2)), first);
  const moved = stableLineItems(first, build(5));
  assert.notEqual(moved, first);
  assert.equal(moved.get("b.ts"), first.get("b.ts"));
  assert.equal(moved.get("a.ts")?.[0].side, "deletions");
});
