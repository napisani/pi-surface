import assert from "node:assert/strict";
import { test } from "node:test";
import { applyPatch } from "../../src/host/patch.ts";
import { at } from "../../src/host/ptr.ts";
import { finishTask, setTaskStatus, startTask, stopTask, type Task } from "../../src/kit/task.ts";

interface State {
  review: Task & { findings: string[] };
}

test("a task starts, reports progress or failure, and finishes, keeping its results", () => {
  const state: State = { review: { status: "done", note: "old", finishedAt: "t0", findings: ["F1"] } };
  const p = at<State>()("review");
  applyPatch(state, startTask(p, state.review, "auth", "t1", "a review is already running"));
  assert.deepEqual(state.review, { status: "running", requestedAt: "t1", focus: "auth", findings: ["F1"] });
  assert.throws(() => startTask(p, state.review, undefined, "t2", "a review is already running"), /already running/);
  applyPatch(state, setTaskStatus(p, state.review, "running", "lenses running", "t2", "the review"));
  assert.equal(state.review.note, "lenses running");
  applyPatch(state, setTaskStatus(p, state.review, "failed", "lens crashed", "t3", "the review"));
  assert.deepEqual([state.review.status, state.review.note, state.review.finishedAt], ["failed", "lens crashed", "t3"]);
  applyPatch(state, finishTask(p, state.review, "t4"));
  assert.deepEqual([state.review.status, state.review.finishedAt, state.review.findings], ["done", "t4", ["F1"]]);
});

test("progress goes only to a task the page started, so a stray note cannot lock the page", () => {
  const state: State = { review: { status: "done", findings: ["F1"] } };
  const p = at<State>()("review");
  assert.throws(() => setTaskStatus(p, state.review, "running", "migration applied", "t1", "the review"), /the review is not running/);
});

test("the user can stop a running task, which keeps its earlier results", () => {
  const state: State = { review: { status: "done", findings: ["F1"] } };
  const p = at<State>()("review");
  assert.throws(() => stopTask(p, state.review, "t0", "the review"), /the review is not running/);
  applyPatch(state, startTask(p, state.review, undefined, "t1", "busy"));
  applyPatch(state, stopTask(p, state.review, "t2", "the review"));
  assert.deepEqual(state.review, { status: "failed", requestedAt: "t1", note: "Stopped from the page.", finishedAt: "t2", findings: ["F1"] });
});
