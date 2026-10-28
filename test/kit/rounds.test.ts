import assert from "node:assert/strict";
import { test } from "node:test";
import { applyPatch } from "../../src/host/patch.ts";
import { at } from "../../src/host/ptr.ts";
import { checkUpdate, editRoundText, followUpRound, newRoundWork, recallRound, sendRound, updateRound, type RoundWork } from "../../src/kit/rounds.ts";

const NOW = "2026-10-26T00:00:00Z";
// The two layouts that use rounds today: a top-level list, and work nested in an item.
interface Flat {
  requests: (RoundWork & { id: string })[];
}
interface Nested {
  items: { id: string; fix?: RoundWork }[];
}

test("a round sends pending work, takes it back, and records the agent's outcome, in either layout", () => {
  const flat: Flat = { requests: [{ id: "R1", ...newRoundWork("use ===", NOW) }] };
  const nested: Nested = { items: [{ id: "PF-1" }, { id: "PF-2", fix: newRoundWork("rename", NOW) }] };
  const r = at<Flat>();
  const f = at<Nested>();

  applyPatch(flat, sendRound([r("requests", 0)], 1));
  applyPatch(nested, sendRound([f("items", 1, "fix")], 1));
  assert.deepEqual([flat.requests[0].status, flat.requests[0].round], ["sent", 1]);
  assert.deepEqual([nested.items[1].fix?.status, nested.items[1].fix?.round], ["sent", 1]);

  applyPatch(flat, recallRound([{ p: r("requests", 0), work: flat.requests[0] }]));
  assert.equal(flat.requests[0].status, "pending");
  applyPatch(flat, editRoundText(r("requests", 0), flat.requests[0], "  use === here ", "R1"));
  assert.equal(flat.requests[0].messages[0].text, "use === here");

  applyPatch(nested, updateRound(f("items", 1, "fix"), { status: "needs-input", reply: " Which name? " }, NOW));
  assert.deepEqual(nested.items[1].fix?.messages.at(-1), { role: "agent", text: "Which name?", at: NOW });
  assert.throws(() => editRoundText(f("items", 1, "fix"), nested.items[1].fix!, "x", "PF-2's fix"), /PF-2's fix is needs-input/);
  applyPatch(nested, followUpRound(f("items", 1, "fix"), nested.items[1].fix!, "matches", NOW, "PF-2's fix"));
  assert.equal(nested.items[1].fix?.status, "pending");
  assert.throws(() => followUpRound(f("items", 1, "fix"), nested.items[1].fix!, "again", NOW, "PF-2's fix"), /wait for the agent's reply/);
});

test("an outcome needs a known status and a reply", () => {
  assert.deepEqual(checkUpdate({ status: "done", reply: "ok" }, "R1"), []);
  // SAFETY: an unknown status on purpose; checkUpdate must report it.
  assert.deepEqual(checkUpdate({ status: "maybe" as never, reply: " " }, "R1"), ["R1: status must be done, declined or needs-input", "R1: needs a reply"]);
});
