import { parsePatchFiles } from "@pierre/diffs";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Finding } from "../../../../src/kit/findings.ts";
import type { PrFile } from "../../../../src/kit/git.ts";
import { emptyState, type ChangeRequest, type DraftComment, type RemoteComment, type ReviewState } from "../state.ts";
import { ALL_CATEGORIES, createLineItemsSelector, NO_FILTERS, reviewLineItems, visibleFiles } from "../web/lineItems.ts";

const file = { path: "src/auth.ts", status: "modified", additions: 4, deletions: 1, binary: false, category: "impl", fingerprint: "fp1" } as const;

function seeded(): ReviewState {
  const remote: RemoteComment = { id: 10, path: "src/auth.ts", side: "RIGHT", line: 3, body: "why?", author: "bob", url: "u", createdAt: "t" };
  const reply: RemoteComment = { ...remote, id: 11, inReplyTo: 10 };
  const comment: DraftComment = {
    id: "C1",
    anchor: { path: "src/auth.ts", side: "RIGHT", line: 3 },
    origin: { kind: "manual" },
    body: "b",
    status: "draft",
    assisting: false,
    updatedAt: "t",
    createdAt: "t",
  };
  const finding: Finding = {
    id: "F1",
    title: "Loose compare",
    severity: "High",
    confidence: "High",
    category: "correctness",
    summary: "s",
    primary: { path: "src/auth.ts", rev: "base", startLine: 2, endLine: 3 },
    related: [],
    visuals: [],
    dismissed: false,
    thread: [],
  };
  const request = (id: string, fingerprint: string): ChangeRequest => ({
    id,
    anchor: { path: "src/auth.ts", side: "RIGHT", line: 4 },
    fingerprint,
    origin: { kind: "manual" },
    status: "pending",
    messages: [],
    createdAt: "t",
    updatedAt: "t",
  });
  return {
    ...emptyState(),
    files: [file],
    remote: [remote, reply],
    comments: [comment],
    review: { status: "done", findings: [finding], dropped: [], disagreements: [] },
    questions: [{ id: "Q1", ref: { path: "src/auth.ts", rev: "work", startLine: 4, endLine: 4 }, messages: [], visuals: [], resolved: false, createdAt: "t" }],
    requests: [request("R1", "fp1"), request("R2", "old")],
  };
}

test("one annotation per item, threads first and requests last", () => {
  const items = reviewLineItems(seeded(), { anchor: { path: "src/auth.ts", side: "RIGHT", line: 5 } }).get("src/auth.ts")!;
  assert.deepEqual(
    items.map((a) => [a.metadata.kind, a.metadata.id, a.side, a.lineNumber]),
    [
      ["thread", 10, "additions", 3],
      ["comment", "C1", "additions", 3],
      ["composer", "composer", "additions", 5],
      ["finding", "F1", "deletions", 3],
      ["question", "Q1", "additions", 4],
      ["request", "R1", "additions", 4],
    ],
  );
});

test("a request whose file changed since it was written stays off the diff", () => {
  const ids = reviewLineItems(seeded(), null)
    .get("src/auth.ts")!
    .map((a) => a.metadata.id);
  assert.ok(!ids.includes("R2"));
});

test("the selector returns the same map while no annotation moves", () => {
  const select = createLineItemsSelector();
  const state = seeded();
  const first = select(state, null);
  const edited = { ...state, comments: [{ ...state.comments[0], body: "new text" }] };
  assert.equal(select(edited, null), first);
  assert.notEqual(select(edited, { anchor: { path: "src/auth.ts", side: "LEFT", line: 1 } }), first);
});

test("a file shows only when both its kind and its change pass; renames count as modified, copies as added", () => {
  const f = (path: string, status: PrFile["status"], category: PrFile["category"]): PrFile => ({ path, status, category, additions: 1, deletions: 0, binary: false, fingerprint: path });
  const state: ReviewState = {
    ...emptyState(),
    files: [f("src/a.ts", "modified", "impl"), f("src/b.ts", "added", "impl"), f("test/a.test.ts", "added", "test"), f("old.md", "deleted", "docs"), f("src/c.ts", "renamed", "impl"), f("src/d.ts", "copied", "impl")],
  };
  const shown = (categories: PrFile["category"][], changes: ("modified" | "added" | "deleted")[]) =>
    visibleFiles(state, { ...NO_FILTERS, categories: new Set(categories), changes: new Set(changes) }, new Set(), new Map()).map((x) => x.path);
  assert.equal(shown([...ALL_CATEGORIES], ["modified", "added", "deleted"]).length, 6);
  assert.deepEqual(shown(["impl"], ["added"]), ["src/b.ts", "src/d.ts"]);
  assert.deepEqual(shown(["impl", "test"], ["added"]), ["src/b.ts", "test/a.test.ts", "src/d.ts"]);
  assert.deepEqual(shown(["impl"], ["modified"]), ["src/a.ts", "src/c.ts"]);
  assert.deepEqual(shown(["impl"], ["deleted"]), []);
  assert.deepEqual(shown([...ALL_CATEGORIES], []), []);
});

test("the token filter keeps files whose changes hold the token, and waits for the patches", () => {
  const f = (path: string): PrFile => ({ path, status: "modified", category: "impl", additions: 1, deletions: 1, binary: false, fingerprint: path });
  const patch = (path: string, before: string, after: string) => [`diff --git a/${path} b/${path}`, `--- a/${path}`, `+++ b/${path}`, "@@ -1 +1 @@", `-${before}`, `+${after}`, ""].join("\n");
  const parsed = parsePatchFiles([patch("a.ts", "check(x)", "check(y)"), patch("b.ts", "other(x)", "other(y)")].join("\n"), "t")[0].files;
  const patches = new Map(parsed.map((p) => [p.name, p]));
  const state: ReviewState = { ...emptyState(), files: [f("a.ts"), f("b.ts")] };
  const filters = { ...NO_FILTERS, token: "check" };
  assert.deepEqual(visibleFiles(state, filters, new Set(), new Map(), patches).map((x) => x.path), ["a.ts"]);
  assert.deepEqual(visibleFiles(state, filters, new Set(), new Map()).map((x) => x.path), ["a.ts", "b.ts"], "no patches yet");
});
