import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadKeybindings } from "../../src/host/keybindings.ts";
import { DEFAULT_KEYBINDINGS } from "../../src/kit/keybindings.ts";

test("missing config uses defaults, overrides load, and malformed config fails visibly", async () => {
  const path = join(await mkdtemp(join(tmpdir(), "surface-keys-")), "keys.json");
  assert.deepEqual(await loadKeybindings(path), { config: DEFAULT_KEYBINDINGS });
  const config = { leader: ",", bindings: { "review.changes.next": ["]n"], "surface.commands": [] } };
  await writeFile(path, JSON.stringify(config));
  assert.deepEqual(await loadKeybindings(path), { config });
  await writeFile(path, '{"leader":"oops"}');
  assert.match((await loadKeybindings(path)).error ?? "", /exactly one/);
  await writeFile(path, "not JSON");
  assert.match((await loadKeybindings(path)).error ?? "", /Keyboard configuration/);
});
