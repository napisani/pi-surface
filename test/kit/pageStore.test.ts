import assert from "node:assert/strict";
import { test } from "node:test";
import { createStore } from "../../web/kit/store.ts";

interface S {
  rev: number;
  list: string[];
}

test("set and apply notify; revision follows revisionKey only", () => {
  const store = createStore<S>((s) => String(s.rev));
  let calls = 0;
  store.subscribe(() => calls++);
  store.set({ rev: 1, list: [] });
  assert.equal(store.revision(), "1");
  store.apply([{ op: "add", path: "/list/-", value: "x" }]);
  assert.equal(calls, 2);
  assert.equal(store.revision(), "1");
  store.apply([{ op: "replace", path: "/rev", value: 2 }]);
  assert.equal(store.revision(), "2");
});

test("a delta that fails keeps the previous snapshot", () => {
  const store = createStore<S>();
  store.set({ rev: 1, list: ["a"] });
  const before = store.get();
  assert.throws(() => store.apply([{ op: "replace", path: "/missing/deep", value: 1 }]));
  assert.equal(store.get(), before);
});
