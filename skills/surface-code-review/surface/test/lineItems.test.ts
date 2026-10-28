import assert from "node:assert/strict";
import { test } from "node:test";
import type { Finding } from "../../../../src/kit/findings.ts";
import { emptyState, type ChangeRequest, type DraftComment, type RemoteComment, type ReviewState } from "../state.ts";
import { createLineItemsSelector, reviewLineItems } from "../web/lineItems.ts";

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
