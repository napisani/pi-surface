import assert from "node:assert/strict";
import { test } from "node:test";
import { applyPatch } from "../../src/host/patch.ts";
import { at } from "../../src/host/ptr.ts";
import type { Opinion } from "../../src/kit/opinion.ts";
import { resolveOpinionAction, type OpinionAction, type OpinionScope } from "../../src/kit/opinionActions.ts";
import { applyOpinionUpdate, postFindings } from "../../src/kit/opinion.ts";

interface S {
  opinions: Opinion[];
}
const list = at<S>()("opinions");

function harness() {
  let state: S = { opinions: [] };
  const messages: string[] = [];
  const scope = (): OpinionScope<S> => ({
    list,
    opinions: state.opinions,
    target: (kind, id) => ({ kind, id, label: `the ${kind} ${id}` }),
    brief: (t) => ({ content: `${t.label} in plan/${t.id}.md`, revise: "republish it with surface_x_artifact" }),
    tools: { findings: "surface_x_opinion", update: "surface_x_opinion_update" },
  });
  const act = (action: OpinionAction) => {
    const { ops, message } = resolveOpinionAction(scope(), action, "t");
    state = applyPatch(structuredClone(state), ops);
    if (message) {
      messages.push(message);
    }
  };
  const apply = (fn: (s: S) => ReturnType<typeof postFindings>) => {
    state = applyPatch(structuredClone(state), fn(state));
  };
  return { act, apply, messages, get: () => state };
}

test("a second opinion runs review, triage, corrections, a ruling and a capped re-review", () => {
  const h = harness();
  h.act({ type: "opinion.request", targetKind: "artifact", targetId: "rfc", model: "openai-codex/gpt-6-luna", prompt: "Challenge it.", promptName: "Skeptic", maxPasses: 2 });
  assert.match(h.messages[0], /second opinion O1 on the artifact rfc · pass 1 of 2/);
  assert.match(h.messages[0], /subagent on model openai-codex\/gpt-6-luna/);
  assert.throws(() => h.act({ type: "opinion.request", targetKind: "artifact", targetId: "rfc", model: "m", prompt: "p" }), /already in progress/);

  h.apply((s) => postFindings(list, s.opinions, "O1", { findings: [{ severity: "High", claim: "No rollback plan" }, { severity: "Low", claim: "Typo" }, { severity: "Medium", claim: "Skips caching" }], runId: "run-7" }, "t"));
  assert.equal(h.get().opinions[0].status, "triage");
  assert.deepEqual(h.get().opinions[0].findings.map((f) => f.id), ["O1.1", "O1.2", "O1.3"]);

  assert.throws(() => h.act({ type: "opinion.send", opinionId: "O1" }), /triage every finding/);
  h.act({ type: "opinion.verdict", opinionId: "O1", findingIds: ["O1.1", "O1.3"], verdict: "accept" });
  h.act({ type: "opinion.verdict", opinionId: "O1", findingIds: ["O1.2"], verdict: "reject" });
  h.act({ type: "opinion.send", opinionId: "O1" });
  assert.match(h.messages[1], /O1.1 \[High\] No rollback plan/);
  assert.doesNotMatch(h.messages[1], /Typo/, "rejected findings stay with the user");

  assert.throws(() => h.apply((s) => applyOpinionUpdate(list, s.opinions, "O1", { updates: [{ findingId: "O1.1", status: "done", reply: "Added" }] }, "t")), /answer every finding sent back: O1.3/);
  h.apply((s) =>
    applyOpinionUpdate(list, s.opinions, "O1", { updates: [{ findingId: "O1.1", status: "done", reply: "Added a rollback section" }, { findingId: "O1.3", status: "declined", reply: "Reads are rare" }], before: "a", after: "b" }, "t"),
  );
  assert.equal(h.get().opinions[0].status, "revised");
  assert.deepEqual([h.get().opinions[0].before, h.get().opinions[0].after], ["a", "b"]);

  h.act({ type: "opinion.rule", opinionId: "O1", findingId: "O1.3", side: "reviewer" });
  h.act({ type: "opinion.send", opinionId: "O1" });
  assert.match(h.messages[2], /O1.3 .*you declined this before \("Reads are rare"\); the user sided with the reviewer/);
  h.apply((s) => applyOpinionUpdate(list, s.opinions, "O1", { updates: [{ findingId: "O1.3", status: "done", reply: "Cached" }] }, "t"));
  assert.equal(h.get().opinions[0].findings[2].ruling, undefined);

  h.act({ type: "opinion.reReview", opinionId: "O1" });
  assert.match(h.messages[3], /pass 2 of 2/);
  assert.match(h.messages[3], /Resume reviewer run run-7/);
  assert.match(h.messages[3], /O1.3 \[Medium\] Skips caching .* accept · done: Cached/);
  h.apply((s) => postFindings(list, s.opinions, "O1", { findings: [] }, "t"));
  assert.equal(h.get().opinions[0].status, "settled", "a clean pass settles it");
  assert.throws(() => h.act({ type: "opinion.reReview", opinionId: "O1" }), /re-review after corrections/);
});

test("questions about a finding go to the agent and its replies land in the thread", () => {
  const h = harness();
  h.act({ type: "opinion.request", targetKind: "node", targetId: "N2", model: "m", prompt: "p" });
  h.apply((s) => postFindings(list, s.opinions, "O1", { findings: [{ severity: "Medium", claim: "Option B ignores tenants" }] }, "t"));
  h.act({ type: "opinion.ask", opinionId: "O1", findingId: "O1.1", text: "Which tenants?" });
  assert.match(h.messages.at(-1)!, /question about O1.1/);
  h.apply((s) => applyOpinionUpdate(list, s.opinions, "O1", { replies: [{ findingId: "O1.1", text: "The EU ones." }] }, "t"));
  assert.deepEqual(h.get().opinions[0].findings[0].thread.map((m) => [m.role, m.text]), [
    ["user", "Which tenants?"],
    ["agent", "The EU ones."],
  ]);
});
