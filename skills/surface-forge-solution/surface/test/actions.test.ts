import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAction, resolveAction } from "../actions.ts";
import { applyPatch } from "../../../../src/host/patch.ts";
import { SurfaceError } from "../../../../src/host/workflow.ts";
import { emptyState, postDraft, postRound, type QuestionInput } from "../state.ts";
import { cacheIsolation } from "./fixtures.ts";

const NOW = "2026-10-21T12:00:00.000Z";

function seeded(...round: QuestionInput[]) {
  const state = emptyState();
  applyPatch(state, postRound(state, round.length ? round : [cacheIsolation()]));
  return state;
}

test("parseAction accepts every action type and drops empty optionals", () => {
  assert.deepEqual(parseAction({ type: "answer", questionId: "D7", optionId: "isolate", note: "" }), { type: "answer", questionId: "D7", optionId: "isolate" });
  assert.deepEqual(parseAction({ type: "followUp", questionId: "D7", text: "  why?  " }), { type: "followUp", questionId: "D7", text: "why?" });
  assert.deepEqual(parseAction({ type: "defer", questionId: "D7" }), { type: "defer", questionId: "D7" });
  assert.deepEqual(parseAction({ type: "revisit", decisionId: "D7" }), { type: "revisit", decisionId: "D7" });
  assert.deepEqual(parseAction({ type: "rfc", requested: true }), { type: "rfc", requested: true });
  assert.deepEqual(parseAction({ type: "draft", kind: "spec" }), { type: "draft", kind: "spec" });
});

test("parseAction rejects unknown types, wrong field types and oversized text", () => {
  assert.throws(() => parseAction({ type: "delete" }), SurfaceError);
  assert.throws(() => parseAction({ type: "answer", questionId: 7, optionId: "x" }), /"questionId" must be string/);
  assert.throws(() => parseAction({ type: "followUp", questionId: "D7", text: "x".repeat(5000) }), /"text" must not have more than 4000 characters/);
  assert.throws(() => parseAction(["answer"]), /action must be object/);
  assert.throws(() => parseAction({ type: "rfc", requested: "yes" }), /"requested" must be boolean/);
  assert.throws(() => parseAction({ type: "draft", kind: "readme" }), /"kind" must be one of spec, rfc/);
});

test("answering the last open question reports the round, including overrides", () => {
  const { ops, message } = resolveAction(seeded(), { type: "answer", questionId: "D7", optionId: "defer", note: "later" }, NOW);
  assert.ok(ops.length > 0);
  assert.match(message!.content, /^round 1 complete:\n- D7 Cache isolation: chose "Defer cache isolation", overriding your recommendation "Isolate cache by source config"\. User note: later/);
});

test("answers are held until every question in the round is settled", () => {
  const state = seeded(cacheIsolation(), { ...cacheIsolation(), id: "D8", header: "Next" });
  const first = resolveAction(state, { type: "answer", questionId: "D7", optionId: "isolate" }, NOW);
  assert.equal(first.message, undefined);
  applyPatch(state, first.ops);
  const last = resolveAction(state, { type: "defer", questionId: "D8" }, NOW);
  assert.equal(last.message!.content, 'round 1 complete:\n- D7 Cache isolation: chose "Isolate cache by source config" (your recommendation).\n- D8 Next: deferred\n\nPost the next frontier round with surface_forge_ask when ready.');
});

test("a follow-up is threaded and explicitly not an answer", () => {
  const state = seeded();
  const { ops, message } = resolveAction(state, { type: "followUp", questionId: "D7", optionId: "isolate", text: "Does this cache .env reads?" }, NOW);
  applyPatch(state, ops);
  assert.equal(state.questions[0].thread[0].text, "Does this cache .env reads?");
  assert.equal(state.questions[0].status, "open");
  assert.match(message!.content, /about option "Isolate cache by source config"/);
  assert.match(message!.content, /not an answer; D7 stays open/);
  assert.match(message!.content, /surface_forge_reply/);
});

test("a revisit names the previous choice and how to re-ask", () => {
  const state = seeded();
  applyPatch(state, resolveAction(state, { type: "answer", questionId: "D7", optionId: "isolate" }, NOW).ops);
  const { message } = resolveAction(state, { type: "revisit", decisionId: "D7" }, NOW);
  assert.match(message!.content, /reopened \(was "Isolate cache by source config"\)/);
  assert.match(message!.content, /surface_forge_ask using id "D7"/);
});

test("an RFC request wakes the agent once and leaves open questions open", () => {
  const state = seeded();
  const requested = resolveAction(state, { type: "rfc", requested: true }, NOW);
  applyPatch(state, requested.ops);
  assert.equal(state.rfcRequested, true);
  assert.equal(state.questions[0].status, "open");
  assert.match(requested.message!.content, /^RFC requested/);

  assert.deepEqual(resolveAction(state, { type: "rfc", requested: true }, NOW), { ops: [] });
  const withdrawn = resolveAction(state, { type: "rfc", requested: false }, NOW);
  applyPatch(state, withdrawn.ops);
  assert.equal(state.rfcRequested, false);
  assert.match(withdrawn.message!.content, /^RFC withdrawn/);
});

test("a draft request lists every decision's status and asks for TBD markers", () => {
  const state = seeded(cacheIsolation(), { ...cacheIsolation(), id: "D8", header: "Next" });
  applyPatch(state, resolveAction(state, { type: "answer", questionId: "D7", optionId: "isolate" }, NOW).ops);
  const { ops, message } = resolveAction(state, { type: "draft", kind: "rfc" }, NOW);
  applyPatch(state, ops);
  assert.equal(state.drafts.rfc?.writing, true);
  assert.equal(state.questions[1].status, "open");
  assert.match(message!.content, /^draft requested: RFC\./);
  assert.match(message!.content, /TBD\(D4\)/);
  assert.match(message!.content, /surface_forge_draft \(kind "rfc"\)/);
  assert.match(message!.content, /- D7 Cache isolation: chose "Isolate cache by source config" \(your recommendation\)\.\n- D8 Next: open$/);
});

test("parseAction accepts a draft review and rejects unknown verdicts", () => {
  assert.deepEqual(parseAction({ type: "draft.review", kind: "spec", verdict: "changes", note: "  shorter  " }), { type: "draft.review", kind: "spec", verdict: "changes", note: "shorter" });
  assert.deepEqual(parseAction({ type: "draft.review", kind: "rfc", verdict: "approve", note: "" }), { type: "draft.review", kind: "rfc", verdict: "approve" });
  assert.throws(() => parseAction({ type: "draft.review", kind: "spec", verdict: "maybe" }), /"verdict" must be one of approve, approveWithRfc, changes/);
});

function withFinal(kind: "spec" | "rfc" = "spec") {
  const state = seeded();
  applyPatch(state, postDraft(state, kind, "# Spec", NOW, { final: true, path: ".scratch/specs/x.md" }));
  return state;
}

test("approving the only final draft ends the session and names its path", () => {
  const state = withFinal();
  const { ops, message } = resolveAction(state, { type: "draft.review", kind: "spec", verdict: "approve" }, NOW);
  applyPatch(state, ops);
  assert.deepEqual(state.drafts.spec?.review, { verdict: "approved", at: NOW });
  assert.match(message!.content, /^tech spec approved\. Every draft is approved; the session is done\. Close by stating each draft's path \(tech spec: \.scratch\/specs\/x\.md\)\./);
  assert.throws(() => resolveAction(state, { type: "draft.review", kind: "spec", verdict: "approve" }, NOW), /already approved/);
});

test("requesting changes needs a note, and posting the draft again clears the verdict", () => {
  const state = withFinal();
  assert.throws(() => resolveAction(state, { type: "draft.review", kind: "spec", verdict: "changes" }, NOW), /say what to change/);
  const { ops, message } = resolveAction(state, { type: "draft.review", kind: "spec", verdict: "changes", note: "Cut the RGR plan" }, NOW);
  applyPatch(state, ops);
  assert.equal(state.drafts.spec?.review?.verdict, "changes");
  assert.match(message!.content, /^tech spec changes requested: Cut the RGR plan\n\nRevise the file at \.scratch\/specs\/x\.md, then post it again with surface_forge_draft \(kind "spec", final true\)/);
  applyPatch(state, postDraft(state, "spec", "# Spec v2", NOW, { final: true, path: ".scratch/specs/x.md" }));
  assert.equal(state.drafts.spec?.review, undefined);
});

test("an interim draft cannot be reviewed, and an RFC can be added only while approving the spec", () => {
  const interim = seeded();
  applyPatch(interim, postDraft(interim, "spec", "# Spec\nTBD", NOW));
  assert.throws(() => resolveAction(interim, { type: "draft.review", kind: "spec", verdict: "approve" }, NOW), /no tech spec is waiting for review/);

  const state = withFinal();
  const { ops, message } = resolveAction(state, { type: "draft.review", kind: "spec", verdict: "approveWithRfc" }, NOW);
  applyPatch(state, ops);
  assert.equal(state.rfcRequested, true);
  assert.equal(state.drafts.spec?.review?.verdict, "approved");
  assert.match(message!.content, /the user also wants an RFC/);

  applyPatch(state, postDraft(state, "rfc", "# RFC", NOW, { final: true }));
  assert.throws(() => resolveAction(state, { type: "draft.review", kind: "rfc", verdict: "approveWithRfc" }, NOW), /only when approving the tech spec/);
  const done = resolveAction(state, { type: "draft.review", kind: "rfc", verdict: "approve" }, NOW);
  assert.match(done.message!.content, /^RFC approved\. Every draft is approved/);
});

test("approving the spec while an RFC is requested lists what still waits", () => {
  const state = withFinal();
  state.rfcRequested = true;
  const { message } = resolveAction(state, { type: "draft.review", kind: "spec", verdict: "approve" }, NOW);
  assert.equal(message!.content, "tech spec approved. Still awaiting approval: RFC.");
});
