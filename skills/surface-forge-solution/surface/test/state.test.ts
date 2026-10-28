import assert from "node:assert/strict";
import { test } from "node:test";
import { applyPatch } from "../../../../src/host/patch.ts";
import {
  deferQuestion,
  emptyState,
  postDraft,
  postRound,
  recordAnswer,
  reopenDecision,
  requestDraft,
  reviseOption,
  validateQuestion,
  type ForgeState,
} from "../state.ts";
import { SurfaceError } from "../../../../src/host/workflow.ts";
import { cacheIsolation } from "./fixtures.ts";

const NOW = "2026-10-21T12:00:00.000Z";
const run = (state: ForgeState, ops: ReturnType<typeof postRound>) => applyPatch(state, ops);

test("a valid question passes validation", () => {
  assert.deepEqual(validateQuestion(cacheIsolation()), []);
});

test("every option must supply every lens and every dimension", () => {
  const q = cacheIsolation();
  delete q.options[1].visuals.diff;
  delete q.options[0].scores.migrate;
  q.options[0].visuals.er = { kind: "diff", unified: "" };
  const errors = validateQuestion(q);
  assert.ok(errors.some((e) => e.includes(`option "defer" is missing lens "diff"`)), errors.join("\n"));
  assert.ok(errors.some((e) => e.includes(`missing a score for "migrate"`)));
  assert.ok(errors.some((e) => e.includes(`lens "er" must be kind "mermaid"`)));
});

test("every option must list at least one pro and one con", () => {
  const q = cacheIsolation();
  q.options[0].pros = [];
  q.options[1].cons = [];
  const errors = validateQuestion(q);
  assert.ok(errors.includes(`option "isolate" needs at least one pro`), errors.join("\n"));
  assert.ok(errors.includes(`option "defer" needs at least one con`), errors.join("\n"));
});

test("long option descriptions and pros or cons are sent back for a rewrite", () => {
  const q = cacheIsolation();
  q.options[0].description = "x".repeat(281);
  q.options[1].cons = ["y".repeat(101)];
  const errors = validateQuestion(q);
  assert.ok(errors.some((e) => e.includes(`option "isolate" description is 281 characters`)), errors.join("\n"));
  assert.ok(errors.some((e) => e.includes(`option "defer" pro/con`)), errors.join("\n"));
});

test("rejects out-of-range scores, duplicate ids and two recommendations", () => {
  const q = cacheIsolation();
  q.options[1].scores.correct.value = 6;
  q.options[1].recommended = true;
  q.lenses.push({ id: "er", label: "again", kind: "mermaid" });
  const errors = validateQuestion(q);
  assert.ok(errors.some((e) => e.includes("integer 1-5")));
  assert.ok(errors.some((e) => e.includes("at most one option may be recommended")));
  assert.ok(errors.some((e) => e.includes(`duplicate lens id "er"`)));
});

test("posting a question advances the round and opens it", () => {
  const state = emptyState();
  run(state, postRound(state, [cacheIsolation()]));
  assert.equal(state.round, 1);
  assert.equal(state.questions[0].status, "open");
  assert.deepEqual(state.questions[0].thread, []);
});

test("answering records whether the user overrode the recommendation", () => {
  const state = emptyState();
  run(state, postRound(state, [cacheIsolation()]));
  run(state, recordAnswer(state, "D7", "defer", "ship profiles first", NOW));
  assert.equal(state.questions[0].status, "answered");
  assert.deepEqual(state.decisions[0], {
    id: "D7", optionId: "defer", label: "Defer cache isolation", overrodeRecommendation: true,
    note: "ship profiles first", status: "decided", round: 1, at: NOW,
  });
  assert.throws(() => recordAnswer(state, "D7", "isolate", undefined, NOW), SurfaceError);
});

test("an answered question cannot be re-posted until it is revisited", () => {
  const state = emptyState();
  run(state, postRound(state, [cacheIsolation()]));
  run(state, recordAnswer(state, "D7", "isolate", undefined, NOW));
  assert.throws(() => postRound(state, [cacheIsolation()]), /revisited first/);

  run(state, reopenDecision(state, "D7"));
  assert.equal(state.decisions[0].status, "reopened");
  const reasked = cacheIsolation();
  reasked.title = "Re-asked";
  run(state, postRound(state, [reasked]));
  assert.equal(state.questions.length, 1);
  assert.equal(state.questions[0].title, "Re-asked");
  assert.equal(state.questions[0].round, 2);

  run(state, recordAnswer(state, "D7", "defer", undefined, NOW));
  assert.equal(state.decisions.length, 1);
  assert.equal(state.decisions[0].status, "decided");
});

test("a round posts every question under one round number", () => {
  const state = emptyState();
  const second = { ...cacheIsolation(), id: "D8", header: "Next" };
  run(state, postRound(state, [cacheIsolation(), second]));
  assert.deepEqual(state.questions.map((q) => [q.id, q.round]), [["D7", 1], ["D8", 1]]);
  assert.equal(state.round, 1);
});

test("a round is rejected as a whole, naming each bad question", () => {
  const state = emptyState();
  const bad = { ...cacheIsolation(), id: "D8" };
  bad.options = bad.options.slice(0, 1);
  assert.throws(() => postRound(state, [cacheIsolation(), cacheIsolation()]), /"D7" appears twice/);
  assert.throws(() => postRound(state, [cacheIsolation(), bad]), /D8: a question needs 2-4 options/);
  assert.equal(state.questions.length, 0);
});

test("deferring closes the question with a deferred decision", () => {
  const state = emptyState();
  run(state, postRound(state, [cacheIsolation()]));
  run(state, deferQuestion(state, "D7", NOW));
  assert.equal(state.questions[0].status, "deferred");
  assert.equal(state.decisions[0].status, "deferred");
});

test("revising an option keeps the question valid", () => {
  const state = emptyState();
  run(state, postRound(state, [cacheIsolation()]));
  run(state, reviseOption(state, "D7", "defer", { scores: { correct: { value: 2, why: "only one config in practice" }, change: { value: 5, why: "" }, migrate: { value: 5, why: "" } } }));
  assert.equal(state.questions[0].options[1].scores.correct.value, 2);
  assert.throws(() => reviseOption(state, "D7", "defer", { visuals: {} }), /invalid revision/);
  run(state, reviseOption(state, "D7", "defer", { cons: ["Cross-config reads stay possible"] }));
  assert.deepEqual(state.questions[0].options[1].cons, ["Cross-config reads stay possible"]);
  assert.throws(() => reviseOption(state, "D7", "defer", { pros: [] }), /needs at least one pro/);
});

test("a draft keeps its old markdown while rewriting and records the decisions it reflects", () => {
  const state = emptyState();
  run(state, postRound(state, [cacheIsolation()]));
  run(state, recordAnswer(state, "D7", "isolate", undefined, NOW));
  run(state, postDraft(state, "spec", "# Spec\nTBD(D8): cache backend", NOW));
  assert.deepEqual(state.drafts.spec, { writing: false, markdown: "# Spec\nTBD(D8): cache backend", basis: { D7: "isolate" }, at: NOW, final: false });

  run(state, reopenDecision(state, "D7"));
  run(state, requestDraft(state, "spec", NOW));
  assert.equal(state.drafts.spec?.writing, true);
  assert.equal(state.drafts.spec?.markdown, "# Spec\nTBD(D8): cache backend");
  run(state, postDraft(state, "spec", "# Spec v2", NOW));
  assert.deepEqual(state.drafts.spec?.basis, {}, "a reopened decision is not part of the basis");
  assert.throws(() => postDraft(state, "rfc", "  ", NOW), SurfaceError);
});
