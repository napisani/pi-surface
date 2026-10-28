import assert from "node:assert/strict";
import { test } from "node:test";
import { applyPatch, pointer } from "../../src/host/patch.ts";

test("add appends with '-' and inserts at an index", () => {
  const doc = { items: [1, 3] };
  applyPatch(doc, [
    { op: "add", path: "/items/-", value: 4 },
    { op: "add", path: "/items/1", value: 2 },
  ]);
  assert.deepEqual(doc.items, [1, 2, 3, 4]);
});

test("replace and remove work on objects and arrays", () => {
  const doc = { a: { b: 1 }, list: ["x", "y"] };
  applyPatch(doc, [
    { op: "replace", path: "/a/b", value: 2 },
    { op: "remove", path: "/list/0" },
    { op: "add", path: "/c", value: true },
    { op: "remove", path: "/c" },
  ]);
  assert.deepEqual(doc, { a: { b: 2 }, list: ["y"] });
});

test("rejects replacing a missing key and out-of-range indexes", () => {
  assert.throws(() => applyPatch({ a: 1 }, [{ op: "replace", path: "/b", value: 1 }]), /path not found/);
  assert.throws(() => applyPatch({ l: [] }, [{ op: "replace", path: "/l/0", value: 1 }]), /out of range/);
  assert.throws(() => applyPatch({}, [{ op: "add", path: "", value: 1 }]), /root/);
});

interface Queue {
  thread: string[];
}

interface QueueDoc {
  q?: Queue;
}

test("applied values are copies, so later edits never reach persisted ops", () => {
  const queue: Queue = { thread: [] };
  const ops = [{ op: "add" as const, path: "/q", value: queue }];
  const doc: QueueDoc = {};
  applyPatch(doc, ops);
  applyPatch(doc, [{ op: "add", path: "/q/thread/-", value: "hello" }]);
  assert.deepEqual(ops[0].value.thread, []);
  assert.deepEqual(doc.q?.thread, ["hello"]);
});

test("pointer escapes '/' and '~' so ids cannot traverse paths", () => {
  assert.equal(pointer("questions", "a/b~c", 0), "/questions/a~1b~0c/0");
  const doc = {};
  applyPatch(doc, [{ op: "add", path: pointer("a/b~c"), value: 1 }]);
  assert.deepEqual(doc, { "a/b~c": 1 });
});

test("applyPatchImmutable copies only the changed path and never mutates its input", async () => {
  const { applyPatchImmutable } = await import("../../src/host/patch.ts");
  const doc = { comments: [{ id: "C1", body: "a" }, { id: "C2", body: "b" }], files: [{ path: "x" }], meta: { n: 1 } };
  const frozen = structuredClone(doc);
  const next = applyPatchImmutable(doc, [
    { op: "replace", path: "/comments/1/body", value: "B" },
    { op: "add", path: "/comments/-", value: { id: "C3", body: "c" } },
    { op: "remove", path: "/meta/n" },
    { op: "add", path: "/meta/m", value: 2 },
  ]);
  assert.deepEqual(doc, frozen, "the input is untouched");
  assert.notEqual(next, doc);
  assert.notEqual(next.comments, doc.comments);
  assert.equal(next.comments[0], doc.comments[0], "an untouched sibling keeps its identity");
  assert.notEqual(next.comments[1], doc.comments[1]);
  assert.equal(next.files, doc.files, "an untouched branch keeps its identity");
  assert.deepEqual(next, { comments: [{ id: "C1", body: "a" }, { id: "C2", body: "B" }, { id: "C3", body: "c" }], files: [{ path: "x" }], meta: { m: 2 } });
});

test("applyPatchImmutable throws on an invalid path and leaves the input untouched", async () => {
  const { applyPatchImmutable } = await import("../../src/host/patch.ts");
  const doc = { list: [1], obj: {} };
  const frozen = structuredClone(doc);
  assert.throws(() => applyPatchImmutable(doc, [{ op: "add", path: "/obj/a", value: 1 }, { op: "replace", path: "/list/5", value: 2 }]), /out of range/);
  assert.throws(() => applyPatchImmutable(doc, [{ op: "replace", path: "/missing/x", value: 1 }]), /path not found/);
  assert.deepEqual(doc, frozen);
});
