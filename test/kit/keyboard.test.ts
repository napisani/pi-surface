import assert from "node:assert/strict";
import { test } from "node:test";
import type { Json } from "../../src/host/decode.ts";
import { parseKeybindings } from "../../src/kit/keybindings.ts";
import { fuzzyMatch, Keyboard } from "../../web/kit/keyboard.ts";

const command = (id: string, keys: string[], run = () => undefined) => ({ id, label: id, keys, run });

test("leader sequences and aliases execute once without waiting for hints", () => {
  const keyboard = new Keyboard();
  let count = 0;
  keyboard.register("files", 1, [command("next", ["]g", "]c", "<leader>cn"], () => { count++; })]);
  for (const sequence of ["]g", "]c", ";cn"]) {
    for (const key of sequence) { assert.equal(keyboard.press(key), true); }
  }
  assert.equal(count, 3);
  assert.deepEqual(keyboard.get().prefix, []);
  assert.equal(keyboard.press(" "), false);
});

test("invalid continuation cancels and is not replayed as a root command", () => {
  const keyboard = new Keyboard();
  let count = 0;
  keyboard.register("app", 0, [command("next", ["]g"]), command("other", ["x"], () => { count++; })]);
  keyboard.press("]");
  assert.equal(keyboard.press("x"), true);
  assert.equal(count, 0);
  assert.equal(keyboard.get().prefix.length, 0);
});

test("remapping replaces defaults and an empty list unbinds", () => {
  const keyboard = new Keyboard();
  keyboard.configure(parseKeybindings({ leader: ",", bindings: { next: ["<leader>n"], off: [] } }));
  keyboard.register("app", 0, [command("next", ["]g"]), command("off", ["x"])]);
  assert.equal(keyboard.press("]"), false);
  assert.equal(keyboard.press("x"), false);
  assert.equal(keyboard.press(","), true);
  keyboard.cancel();
});

test("higher scope reserves disabled keys instead of falling through", () => {
  const keyboard = new Keyboard();
  let count = 0;
  keyboard.register("app", 0, [command("app.next", ["j"], () => { count++; })]);
  const remove = keyboard.register("list", 2, [{ ...command("list.next", ["j"]), disabled: "End of list" }]);
  keyboard.press("j");
  assert.equal(count, 0);
  remove();
  keyboard.press("j");
  assert.equal(count, 1);
});

test("ambiguous and prefix bindings fail closed with visible errors", () => {
  for (const keys of [["j", "j"], ["g", "gf"]]) {
    const keyboard = new Keyboard();
    keyboard.register("app", 0, keys.map((key, index) => command(String(index), [key])));
    assert.match(keyboard.get().error, /[Cc]onflict/);
    assert.equal(keyboard.press("g"), false);
  }
});

test("unmounting cancels prefixes; fuzzy matching works across words", () => {
  const keyboard = new Keyboard();
  const remove = keyboard.register("tab", 1, [command("next", ["]g"])]);
  keyboard.press("]");
  remove();
  assert.deepEqual(keyboard.get().prefix, []);
  assert.ok(fuzzyMatch("Find Changed Files", "fcf"));
  assert.ok(!fuzzyMatch("Find Changed Files", "xyz"));
});

test("configuration rejects unknown fields, invalid chords, and multi-key leaders", () => {
  const invalid: Json[] = [{ leader: "ab" }, { leader: "<leader>" }, { nope: true }, { bindings: { next: ["<bad key>"] } }];
  for (const config of invalid) {
    assert.throws(() => parseKeybindings(config));
  }
});
