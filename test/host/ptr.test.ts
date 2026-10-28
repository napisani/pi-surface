import assert from "node:assert/strict";
import { test } from "node:test";
import { applyPatch } from "../../src/host/patch.ts";
import { add, append, at, child, item, remove, replace } from "../../src/host/ptr.ts";

interface Fix {
  status: string;
  round?: number;
}
interface State {
  items: { id: string; fix?: Fix }[];
  "a/b~c": number;
  target: { title: string } | null;
}

test("pointers build the escaped RFC 6901 string the patch log stores", () => {
  const p = at<State>();
  assert.equal(p("items", 2, "fix"), "/items/2/fix");
  assert.equal(p("a/b~c"), "/a~1b~0c");
  assert.equal(child(p("items", 0), "fix"), "/items/0/fix");
  assert.equal(item(p("items"), 4), "/items/4");
  assert.deepEqual(append(p("items"), { id: "x" }), { op: "add", path: "/items/-", value: { id: "x" } });
});

test("ops built from pointers apply to the state they were typed against", () => {
  const p = at<State>();
  const state: State = { items: [{ id: "a" }], "a/b~c": 1, target: { title: "t" } };
  applyPatch(state, [
    add(p("items", 0, "fix"), { status: "pending" }),
    add(child(p("items", 0, "fix"), "round"), 2),
    replace(p("a/b~c"), 5),
    replace(p("target"), null),
    append(p("items"), { id: "b" }),
    remove(p("items", 1)),
  ]);
  assert.deepEqual(state, { items: [{ id: "a", fix: { status: "pending", round: 2 } }], "a/b~c": 5, target: null });
});
