import assert from "node:assert/strict";
import { test } from "node:test";
import { applyPatch } from "../../src/host/patch.ts";
import { at } from "../../src/host/ptr.ts";
import { editDraft, finishPosting, newDraft, setAssisting, startPosting, type GitHubDraft } from "../../src/kit/github-draft.ts";

const NOW = "2026-10-26T00:00:00Z";
interface State {
  reply: GitHubDraft;
}
const p = at<State>()("reply");

test("a draft posts only from draft or failed, records the outcome, and a failed draft can be edited back", () => {
  const state: State = { reply: newDraft("", NOW, { assisting: true }) };
  assert.throws(() => startPosting(p, state.reply, "PF-1's reply"), /still being drafted/);
  applyPatch(state, editDraft(p, state.reply, "Fixed in abc.", NOW, "PF-1's reply", "short"));
  assert.deepEqual([state.reply.assisting, state.reply.agentNote], [false, "short"]);

  applyPatch(state, startPosting(p, state.reply, "PF-1's reply"));
  applyPatch(state, finishPosting(p, { error: "HTTP 422" }, NOW));
  assert.deepEqual([state.reply.status, state.reply.error], ["failed", "HTTP 422"]);
  applyPatch(state, setAssisting(p, state.reply, true, "PF-1's reply"));
  assert.equal(state.reply.status, "draft", "asking the agent to revise a failed draft makes it a draft again");
  applyPatch(state, editDraft(p, state.reply, "Fixed in abc1234.", NOW, "PF-1's reply"));

  applyPatch(state, startPosting(p, state.reply, "PF-1's reply"));
  assert.equal(state.reply.error, undefined, "a new attempt clears the old error");
  applyPatch(state, finishPosting(p, { githubId: 9, url: "u" }, NOW));
  assert.deepEqual([state.reply.status, state.reply.githubId], ["posted", 9]);
  assert.throws(() => editDraft(p, state.reply, "x", NOW, "PF-1's reply"), /already posted; edit it on GitHub/);
  assert.throws(() => newDraft("x".repeat(20_001), NOW), /limited to 20000/);
});
