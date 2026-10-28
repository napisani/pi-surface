import assert from "node:assert/strict";
import { test } from "node:test";
import { indexById } from "../../web/kit/indexById.ts";

test("indexById builds one map per array and a new one for a new array", () => {
  const items = [{ id: "C1" }, { id: "C2" }];
  const map = indexById(items);
  assert.equal(map.get("C2"), items[1]);
  assert.equal(indexById(items), map);
  assert.notEqual(indexById([...items]), map);
});
