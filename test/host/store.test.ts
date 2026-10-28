import assert from "node:assert/strict";
import { test } from "node:test";
import { Store } from "../../src/host/store.ts";

test("apply changes the state and tells every subscriber until it unsubscribes", () => {
  const store = new Store({ n: 1 });
  const seen: number[] = [];
  const unsubscribe = store.subscribe((_ops, state) => seen.push(state.n));
  store.apply([{ op: "replace", path: "/n", value: 2 }]);
  store.apply([]);
  unsubscribe();
  store.apply([{ op: "replace", path: "/n", value: 3 }]);
  assert.deepEqual(seen, [2]);
  assert.equal(store.state.n, 3);
});
