import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { runWorkflow } from "../../../../test/harness.ts";
import planWorkflow from "../workflow.ts";
import { choice } from "./fixtures.ts";

function repo(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "plan-repo-")));
  execFileSync("git", ["init", "-q", root]);
  return root;
}

function setup() {
  const worktree = repo();
  const root = mkdtempSync(join(tmpdir(), "plans-root-"));
  const settings = { surface: { plans: { root } } };
  const h = runWorkflow(planWorkflow, "/nonexistent", { settings });
  const repoName = worktree.split("/").pop()!;
  return { ...h, worktree, root, settings, dir: join(root, repoName, "metering-v2"), plan: h.session };
}

test("a new plan is written outside the checkout, with markdown views regenerated from state.json", async () => {
  const { plan, worktree, dir, close } = setup();
  try {
    await assert.rejects(plan.open({ worktree }), /name a plan: pass slug to open one, or a title to start a new one/);
    const opened = await plan.open({ worktree, title: "Metering v2", slug: "metering-v2", destination: "Usage is metered per tenant" });
    assert.equal(opened.created, true);
    assert.equal(opened.ref.dir, dir);
    const created = plan.map({ fog: { add: ["How to backfill old usage"] }, nodes: [{ type: "discuss", title: "Where does metering run?" }, { type: "research", title: "What does the billing API accept?", blockedBy: [] }] });
    assert.deepEqual(created, ["N1", "N2"]);
    plan.map({ nodes: [{ type: "discuss", title: "How is usage stored?", blockedBy: ["N1"] }, { type: "task", title: "Can we read prod usage?", fromFog: "F1", checklist: ["Request read access"] }] });
    await plan.flush();
    const saved = JSON.parse(readFileSync(join(dir, "state.json"), "utf8"));
    assert.deepEqual(saved.nodes.map((n: { id: string; mode: string }) => [n.id, n.mode]), [
      ["N1", "HIL"],
      ["N2", "AFK"],
      ["N3", "HIL"],
      ["N4", "HIL"],
    ]);
    assert.equal(saved.fog[0].graduatedTo, "N4");
    const map = readFileSync(join(dir, "map.md"), "utf8");
    assert.match(map, /^<!-- Generated from state.json/);
    assert.match(map, /## Frontier\n- N1 · discuss · HIL: Where does metering run\?\n- N2 · research · AFK/);
    assert.match(map, /N3 · discuss · HIL · blocked by N1: How is usage stored\?/);
    assert.match(map, /## Not yet specified \(fog\)\n_no fog_/, "graduated fog leaves the fog section");
    assert.deepEqual(readdirSync(join(dir, "decisions")).sort(), ["N1.md", "N2.md", "N3.md", "N4.md"]);
    assert.throws(() => plan.map({ nodes: [{ id: "N1", type: "discuss", title: "Where does metering run?", blockedBy: ["N3"] }] }), /blocking cycle: N1 -> N3 -> N1/);
  } finally {
    await close();
  }
});

test("a decision unblocks its dependents and wakes the agent; reopening it names what is downstream", async () => {
  const { plan, worktree, messages, close } = setup();
  try {
    await plan.open({ worktree, title: "Metering v2", slug: "metering-v2" });
    plan.map({ nodes: [{ type: "discuss", title: "Where does metering run?" }, { type: "discuss", title: "How is usage stored?", blockedBy: ["N1"] }] });
    plan.ask("N1", choice());
    await assert.rejects(plan.handleAction({ type: "node.decide", nodeId: "N2", text: "Postgres" }), /N2 waits on N1/);
    await plan.handleAction({ type: "node.decide", nodeId: "N1", optionId: "edge", note: "latency matters most" });
    assert.match(messages.at(-1)!.content, /^decided N1: At the edge\nPlan: "Metering v2" \(metering-v2\)/);
    assert.match(messages.at(-1)!.content, /This unblocks N2\./);
    assert.equal(plan.state.plan!.decisions[0].overrodeRecommendation, true);

    plan.slices([{ title: "Edge meter", deliverable: "Meter at the edge", acceptance: ["counts match"], touches: ["edge/"], dependsOn: [], size: "M", mode: "AFK", decisions: ["N1"], brief: "Do it" }]);
    await plan.handleAction({ type: "node.reopen", nodeId: "N1" });
    assert.match(messages.at(-1)!.content, /Downstream: nodes N2; slices S1\./);
    assert.equal(plan.state.plan!.decisions[0].status, "reopened");
  } finally {
    await close();
  }
});

test("a second session reads a locked plan, reports a slice through the inbox, and the writer takes it in", async () => {
  const first = setup();
  const second = runWorkflow(planWorkflow, "/nonexistent", { settings: first.settings });
  try {
    await first.plan.open({ worktree: first.worktree, title: "Metering v2", slug: "metering-v2" });
    first.plan.map({ nodes: [{ type: "discuss", title: "Where does metering run?" }] });
    first.plan.slices([{ title: "Edge meter", deliverable: "Meter", acceptance: ["ok"], touches: [], dependsOn: [], size: "S", mode: "AFK", decisions: ["N1"], brief: "b" }]);
    await first.plan.flush();

    const opened = await second.session.open({ worktree: first.worktree, slug: "metering-v2" });
    assert.equal(opened.readOnly, true);
    assert.throws(() => second.session.map({ nodes: [{ type: "task", title: "x?" }] }), /another session .* is editing this plan/);

    const { ingested } = await second.session.report({ worktree: first.worktree, plan: "metering-v2", sliceId: "S1", status: "done", note: "Shipped", deviations: [{ text: "Edge has no clock sync", nodes: ["N1"] }] });
    assert.equal(ingested, false);
    assert.equal(first.plan.state.plan!.reports.length, 0);
    await first.plan.handleAction({ type: "refresh" });
    const [report] = first.plan.state.plan!.reports;
    assert.deepEqual([report.id, report.sliceId, report.status, report.deviations[0].nodes], ["P1", "S1", "done", ["N1"]]);
    assert.equal(first.plan.state.plan!.slices[0].status, "done");
    assert.ok(existsSync(join(first.dir, "inbox", "ingested")), "taken-in reports are filed away");
    await assert.rejects(second.session.report({ worktree: first.worktree, plan: "nope", sliceId: "S1", status: "done", note: "x" }), /no plan "nope" .*; plans there: metering-v2/);
  } finally {
    await second.close();
    await first.close();
  }
});

test("resume reopens the plan from what the session log remembered, not from logged plan state", async () => {
  const { plan, worktree, logged, settings, close } = setup();
  await plan.open({ worktree, title: "Metering v2", slug: "metering-v2" });
  plan.map({ nodes: [{ type: "discuss", title: "Where does metering run?" }] });
  await close();
  assert.deepEqual(
    logged.map((e) => e.ops.map((o) => o.path)),
    [["/ref"]],
    "only the plan's location reaches the session log",
  );
  const resumed = runWorkflow(planWorkflow, "/nonexistent", { settings, entries: logged });
  try {
    assert.deepEqual(await resumed.surface.restore(), []);
    assert.equal(resumed.session.state.plan!.nodes[0].title, "Where does metering run?");
    assert.equal(resumed.session.state.readOnly, false, "the closed session released its lock");
  } finally {
    await resumed.close();
  }
});

test("a second opinion on a node tells the agent where the node lives and how to revise it", async () => {
  const { plan, worktree, messages, dir, close } = setup();
  try {
    await plan.open({ worktree, title: "Metering v2", slug: "metering-v2" });
    plan.map({ nodes: [{ type: "discuss", title: "Where does metering run?" }] });
    plan.ask("N1", choice());
    await plan.handleAction({ type: "opinion.request", targetKind: "node", targetId: "N1", model: "openai-codex/gpt-6-luna", prompt: "Challenge it", maxPasses: 2 });
    const message = messages.at(-1)!.content;
    assert.match(message, /^second opinion O1 on N1 Where does metering run\? · pass 1 of 2\nPlan: "Metering v2"/);
    assert.ok(message.includes(join(dir, "decisions", "N1.md")));
    assert.match(message, /Publish its findings unchanged with surface_plan_opinion/);
    plan.postOpinionFindings("O1", { findings: [{ severity: "High", claim: "Edge cannot see tenant ids" }] });
    assert.equal(plan.state.plan!.opinions[0].status, "triage");
    await assert.rejects(plan.handleAction({ type: "opinion.request", targetKind: "nope", targetId: "x", model: "m", prompt: "p" }), /cannot target "nope"/);
  } finally {
    await close();
  }
});
