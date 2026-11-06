import assert from "node:assert/strict";
import { test } from "node:test";
import { newPlan, type Plan, type PlanNode } from "../state.ts";
import { groupNodes, neighborhood, nextStep, statusLine } from "../web/navigator.ts";

const node = (id: string, extra: Partial<PlanNode> = {}): PlanNode => ({ id, type: "discuss", mode: "HIL", title: `Q${id}`, blockedBy: [], status: "open", visuals: [], thread: [], createdAt: "t", updatedAt: "t", ...extra });

function plan(): Plan {
  const p = newPlan("p", "P", "r", "t");
  p.nodes = [
    node("N1", { status: "decided" }),
    node("N2", { blockedBy: ["N1"] }),
    node("N3", { type: "research", mode: "AFK" }),
    node("N4", { type: "spike", mode: "AFK", run: { status: "running", runIds: [], worktrees: [], startedAt: "t", note: "building 2 approaches" } }),
    node("N5", { blockedBy: ["N2", "N3"] }),
    node("N6", { blockedBy: ["N5"] }),
    node("N7", { status: "deferred" }),
  ];
  p.decisions = [{ nodeId: "N1", optionId: null, label: "In the API", overrodeRecommendation: false, status: "decided", at: "t" }];
  return p;
}

test("nodes group by what they need next, each with its status in words", () => {
  const p = plan();
  assert.deepEqual(
    groupNodes(p).map((g) => [g.group, g.nodes.map((n) => n.id)]),
    [
      ["you", ["N2"]],
      ["running", ["N4"]],
      ["agents", ["N3"]],
      ["waiting", ["N5", "N6"]],
      ["decided", ["N1"]],
      ["deferred", ["N7"]],
    ],
  );
  assert.equal(statusLine(p, p.nodes[0]), "✓ In the API");
  assert.equal(statusLine(p, p.nodes[4]), "waits on N2, N3");
  assert.equal(statusLine(p, p.nodes[3]), "building 2 approaches");
  assert.deepEqual(groupNodes(p, "n5").map((g) => g.nodes.map((n) => n.id)), [["N5"]]);
});

test("a node's neighborhood reaches two steps up and down its blocking edges", () => {
  const graph = neighborhood(plan(), "N2");
  assert.deepEqual(graph.nodes.map((n) => [n.id, n.tone]), [
    ["N1", "done"],
    ["N2", "active"],
    ["N5", "blocked"],
    ["N6", "blocked"],
  ]);
  assert.deepEqual(graph.edges, [
    { from: "N1", to: "N2" },
    { from: "N2", to: "N5" },
    { from: "N5", to: "N6" },
  ]);
});

test("the next step follows a node from start to decision", () => {
  const p = plan();
  const research = p.nodes[2];
  assert.equal(nextStep(p, research), "start", "an AFK node nobody started");
  const asked = { ...research, thread: [{ role: "user" as const, text: "Asked an agent to research this.", at: "t" }] };
  assert.equal(nextStep(p, asked), "working");
  assert.equal(statusLine(p, asked), "asked; waiting for the agent", "the rail moves it to Agents working as soon as it is asked");
  assert.equal(nextStep(p, p.nodes[3]), "working", "a running spike");
  const found = { ...research, result: { markdown: "1,000 per batch", visuals: [], at: "t" }, thread: [{ role: "agent" as const, text: "The findings are in.", at: "t" }] };
  assert.equal(nextStep(p, found), "findings");
  assert.equal(nextStep(p, { ...found, choice: { lenses: [], dimensions: [], options: [] } }), "choose");
  assert.equal(nextStep(p, p.nodes[1]), "ask", "a HIL question with no options");
  assert.equal(nextStep(p, p.nodes[4]), "blocked");
});
