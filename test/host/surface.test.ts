import assert from "node:assert/strict";
import { test } from "node:test";
import { Surface } from "../../src/host/surface.ts";
import { SurfaceError, type OpsEntry } from "../../src/host/workflow.ts";
import { counter } from "./counter.ts";
import { spawnRunner } from "../../src/host/runner.ts";

const A = counter("a");
const B = counter("b");

function surface(entries: OpsEntry[] = []) {
  const persisted: OpsEntry[] = [];
  const notified: [string, string][] = [];
  const opened: string[] = [];
  const changed: string[] = [];
  const s = new Surface(
    {
      persist: (e) => persisted.push(e),
      notifyAgent: (workflow, content) => notified.push([workflow, content]),
      opened: (url) => opened.push(url),
      changed: (workflow) => changed.push(workflow),
      runner: spawnRunner,
    },
    [A, B],
    "/nonexistent",
    entries,
  );
  return { s, persisted, notified, opened, changed };
}

test("a commit persists its batch under the workflow's id and only that workflow has state", async () => {
  const { s, persisted, changed } = surface();
  assert.equal(s.hasState("a"), false);
  s.typed(A).session.bump();
  assert.deepEqual(persisted, [{ workflow: "a", ops: [{ op: "replace", path: "/count", value: 1 }] }]);
  assert.deepEqual(changed, ["a"]);
  assert.equal(s.hasState("a"), true);
  assert.equal(s.hasState("b"), false);
  assert.throws(() => s.running("nope"), SurfaceError);
  await s.close();
});

test("replay applies each workflow's batches in order and ignores the others'", async () => {
  const { s } = surface([
    { workflow: "a", ops: [{ op: "replace", path: "/count", value: 4 }] },
    { workflow: "b", ops: [{ op: "replace", path: "/count", value: 9 }] },
    { workflow: "a", ops: [{ op: "replace", path: "/count", value: 5 }] },
    { workflow: "gone", ops: [{ op: "replace", path: "/x", value: 1 }] },
  ]);
  assert.equal(s.typed(A).store.state.count, 5);
  assert.equal(s.typed(B).store.state.count, 9);
  assert.equal(s.hasState("a") && s.hasState("b"), true);
  await s.close();
});

test("a workflow's page URL opens the browser once, under one server shared by every workflow", async () => {
  const { s, opened } = surface();
  try {
    const session = s.typed(A).session;
    const first = await session.ctx.url();
    await session.ctx.url();
    const other = await s.typed(B).session.ctx.url();
    assert.match(first, /^http:\/\/127\.0\.0\.1:\d+\/[\w-]+\/a\/$/);
    assert.equal(new URL(first).origin, new URL(other).origin);
    assert.deepEqual(opened, [first, other]);
    assert.equal(await s.url(), first.replace(/a\/$/, ""));
  } finally {
    await s.close();
  }
});
