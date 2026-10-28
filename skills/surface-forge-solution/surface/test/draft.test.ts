import type { Element, Root, RootContent } from "hast";
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDraft } from "../draft.ts";

const DRAFT = [
  "# Spec",
  "## Store",
  "Pick one: TBD(D4, D7): which store **wins**. Then more.",
  "### Cache",
  "Use `TBD(D9)` inline, which is code.",
  "```",
  "TBD(D8) in a fence",
  "```",
  "| a | b |\n|---|---|\n| 1 | TBD |",
].join("\n\n");

function find(node: Root | RootContent, match: (e: Element) => boolean, out: Element[] = []): Element[] {
  if (node.type === "element" && match(node)) {
    out.push(node);
  }
  if ("children" in node) {
    for (const child of node.children) {
      find(child, match, out);
    }
  }
  return out;
}

test("TBD markers in text become spans with their ids; code is left alone", () => {
  const { tree, tbds } = parseDraft(DRAFT, "spec");
  assert.deepEqual(
    tbds.map((t) => [t.id, t.ids, t.text, t.section]),
    [
      ["spec-tbd-0", ["D4", "D7"], "which store wins.", "Store"],
      ["spec-tbd-1", [], "", "Cache"],
    ],
  );
  const spans = find(tree, (e) => e.tagName === "span" && e.properties.dataTbd !== undefined);
  assert.deepEqual(
    spans.map((s) => [s.properties.id, s.properties.dataTbd]),
    [
      ["spec-tbd-0", "D4,D7"],
      ["spec-tbd-1", ""],
    ],
  );
  assert.equal(find(tree, (e) => e.tagName === "table").length, 1);
});

test("the outline's ids match the headings in the tree and count their TBDs", () => {
  const { tree, outline } = parseDraft(DRAFT, "rfc");
  assert.deepEqual(
    outline.map((o) => [o.id, o.level, o.title, o.tbds]),
    [
      ["rfc-h-0", 2, "Store", 2],
      ["rfc-h-1", 3, "Cache", 1],
    ],
  );
  assert.deepEqual(
    find(tree, (e) => e.tagName === "h2" || e.tagName === "h3").map((h) => h.properties.id),
    ["rfc-h-0", "rfc-h-1"],
  );
});
