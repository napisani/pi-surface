import assert from "node:assert/strict";
import { test } from "node:test";
import { applyPatch } from "../../../../src/host/patch.ts";
import { parseAction, resolveAction } from "../actions.ts";
import { emptyState, netEffect, ordered, postFindings, reviseFinding, type EntropyState } from "../state.ts";
import { inlineLoader, isoDatesOnly } from "./fixtures.ts";

const apply = (state: EntropyState, ops: Parameters<typeof applyPatch>[1]) => applyPatch(structuredClone(state), ops);
const posted = () => apply(emptyState(), postFindings(emptyState(), "src/config/", [isoDatesOnly(), inlineLoader()]));

test("a batch lists every problem at once, and the first batch needs a scope", () => {
  const bad = { ...inlineLoader(), visuals: [{ kind: "code" as const, label: "After", text: "x" }], scores: { ...inlineLoader().scores, behavior: { value: 4, why: "?" } }, after: ["F9"] };
  for (const part of [/first visual must be the before\/after diff/, /score "behavior" 5/, /unknown finding "F9"/, /needs a scope/]) {
    assert.throws(() => postFindings(emptyState(), undefined, [bad]), part);
  }
});

test("findings are reviewed by batch, then smallest concession first", () => {
  assert.deepEqual(ordered(posted().findings).map((f) => f.id), ["F1", "F2"]);
});

test("a decided finding cannot be replaced until the user reopens it", () => {
  let state = posted();
  state = apply(state, resolveAction(state, { type: "decide", findingId: "F1", verdict: "accept" }, "t").ops);
  assert.throws(() => postFindings(state, undefined, [inlineLoader()]), /already accepted; the user must reopen it first/);
  state = apply(state, resolveAction(state, { type: "reopen", findingId: "F1" }, "t").ops);
  assert.equal(apply(state, postFindings(state, undefined, [inlineLoader()])).batch, 2);
});

test("deciding wakes no one; Send needs every finding decided and reports overrides and notes", () => {
  let state = posted();
  const first = resolveAction(state, { type: "decide", findingId: "F1", verdict: "accept" }, "t");
  assert.equal(first.message, undefined);
  state = apply(state, first.ops);
  assert.throws(() => resolveAction(state, { type: "submit" }, "t"), /decide F2 first/);
  const last = resolveAction(state, { type: "decide", findingId: "F2", verdict: "decline", note: "customers still send US dates" }, "t");
  assert.equal(last.message, undefined);
  state = apply(state, last.ops);
  const sent = resolveAction(state, { type: "submit" }, "t");
  assert.equal(
    sent.message,
    [
      "decisions sent:",
      "- F1 Inline the config loader interface (No concession): accepted (your recommendation).",
      "- F2 Parse only ISO dates (Edge cases): declined, overriding your recommendation to accept. User note: customers still send US dates",
      "",
      "Post any findings that waited on these decisions with surface_entropy_findings. Otherwise the review is settled.",
    ].join("\n"),
  );
  state = apply(state, sent.ops);
  assert.equal(state.submitted, true);
  assert.throws(() => resolveAction(state, { type: "submit" }, "t"), /already sent/);
  assert.deepEqual(netEffect(state.findings), { accepted: 1, lines: 24, concepts: 1, givenUp: { none: 1, internal: 0, edge: 0, feature: 0 } });
  state = apply(state, resolveAction(state, { type: "reopen", findingId: "F2" }, "t").ops);
  assert.equal(state.submitted, false, "a reopened finding has to be sent again");
});

test("reopening clears the note; a follow-up wakes the agent without deciding", () => {
  let state = posted();
  state = apply(state, resolveAction(state, { type: "decide", findingId: "F2", verdict: "accept", note: "fine" }, "t").ops);
  state = apply(state, resolveAction(state, { type: "reopen", findingId: "F2" }, "t").ops);
  assert.equal(state.findings[0].note, undefined);
  const followUp = resolveAction(state, { type: "followUp", findingId: "F2", text: "Which configs use US dates?" }, "t");
  assert.match(followUp.message!, /^follow-up · F2 Parse only ISO dates:\nWhich configs use US dates\?/);
  assert.equal(apply(state, followUp.ops).findings[0].status, "open");
});

test("page input is trimmed, and a blank note is dropped", () => {
  assert.deepEqual(parseAction({ type: "decide", findingId: "F1", verdict: "accept", note: "  " }), { type: "decide", findingId: "F1", verdict: "accept" });
  assert.throws(() => parseAction({ type: "decide", findingId: "F1", verdict: "maybe" }), /verdict/);
  assert.throws(() => parseAction({ type: "followUp", findingId: "F1", text: "  " }), /needs text/);
});

test("a revision must leave the finding valid", () => {
  const state = posted();
  assert.throws(() => reviseFinding(state, "F1", { scores: { ...inlineLoader().scores, behavior: { value: 3, why: "?" } } }), /invalid revision/);
  const ops = reviseFinding(state, "F2", { lines: 120 });
  assert.equal(apply(state, ops).findings[0].lines, 120);
});
