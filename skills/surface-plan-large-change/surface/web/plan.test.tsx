import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { renderSurface } from "../../../../test/web/surface.tsx";
import { newPlan, type PlanNode, type PlanState } from "../state.ts";
import { choice } from "../test/fixtures.ts";
import { DecisionView } from "./DecisionView.tsx";
import { PlanPage } from "./PlanPage.tsx";

// The second-opinion panel fetches the model list from the page's server; there is none here.
globalThis.fetch = async () => new Response("[]");

afterEach(() => {
  cleanup();
  location.hash = "";
});

const node = (id: string, extra: Partial<PlanNode> = {}): PlanNode => ({ id, type: "discuss", mode: "HIL", title: `Question ${id}?`, blockedBy: [], status: "open", visuals: [], thread: [], createdAt: "t", updatedAt: "t", ...extra });

function state(nodes: PlanNode[], extra: Partial<PlanState> = {}): PlanState {
  const plan = { ...newPlan("metering-v2", "Metering v2", "repo", "t"), destination: "Meter every request", nodes };
  return { version: 1, ref: { repo: "repo", slug: "metering-v2", dir: "/plans/repo/metering-v2", worktree: "/w" }, plan, readOnly: false, ...extra };
}

test("the Decision tab decides a node by its picked option, and blocks one whose blockers are open", async () => {
  location.hash = "#node=N1";
  const { posts } = renderSurface(<DecisionView />, state([node("N1", { choice: choice() }), node("N2", { blockedBy: ["N1"] })]));
  fireEvent.click(screen.getByText("At the edge"));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Decide: At the edge" })));
  assert.deepEqual(posts.at(-1)?.action, { type: "node.decide", nodeId: "N1", optionId: "edge", note: "" });
  cleanup();

  location.hash = "#node=N2";
  renderSurface(<DecisionView />, state([node("N1", { choice: choice() }), node("N2", { blockedBy: ["N1"] })]));
  assert.equal(screen.getAllByText("Waiting on other decisions").length, 2, "the rail's group and the node's state say it");
  assert.ok(screen.getByRole("button", { name: /^N1 2 options to choose from$/ }), "its blocker is named with what that blocker needs");
  assert.ok(screen.getByText("Next: decide what this waits on"));
  assert.equal(screen.queryByRole("button", { name: "Decide" }), null, "nothing to decide until N1 is");
});

test("a node without options is decided in words; a task waits for its steps", async () => {
  location.hash = "#node=N1";
  const { posts } = renderSurface(<DecisionView />, state([node("N1")]));
  fireEvent.click(screen.getByRole("button", { name: "Or decide it yourself" }));
  fireEvent.change(screen.getByPlaceholderText("What was decided, in a sentence"), { target: { value: "Postgres, partitioned by day" } });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Decide" })));
  assert.deepEqual(posts.at(-1)?.action, { type: "node.decide", nodeId: "N1", text: "Postgres, partitioned by day", note: "" });
  cleanup();

  location.hash = "#node=N3";
  const task = renderSurface(<DecisionView />, state([node("N3", { type: "task", checklist: [{ text: "Request access", done: false }] })]));
  assert.equal(screen.getByRole<HTMLButtonElement>("button", { name: "Mark done" }).disabled, true);
  fireEvent.click(screen.getByLabelText("Request access"));
  assert.deepEqual(task.posts.at(-1)?.action, { type: "node.check", nodeId: "N3", index: 0, done: true });
});

test("an AFK research node says what to start, and its findings lead to a proposed decision", async () => {
  location.hash = "#node=N1";
  const research = node("N1", { type: "research", mode: "AFK" });
  const { posts } = renderSurface(<DecisionView />, state([research]));
  assert.ok(screen.getByText("Next: start the agent"));
  fireEvent.change(screen.getByPlaceholderText(/^Optional: what to look into/), { target: { value: "batch limits" } });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Start the research" })));
  assert.deepEqual(posts.at(-1)?.action, { type: "node.work", nodeId: "N1", kind: "research", focus: "batch limits" });
  cleanup();

  const found = { ...research, result: { markdown: "Batches of 1,000.", visuals: [], at: "t" }, thread: [{ role: "agent" as const, text: "The findings are in.", at: "t" }] };
  const next = renderSurface(<DecisionView />, state([found]));
  assert.ok(screen.getByText("Next: turn the findings into a decision"));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Have the agent propose a decision" })));
  assert.deepEqual(next.posts.at(-1)?.action, { type: "node.work", nodeId: "N1", kind: "propose", focus: "" });
});

test("switching nodes replaces everything the last node showed", async () => {
  location.hash = "#node=N1";
  renderSurface(<DecisionView />, state([node("N1", { choice: choice(), visuals: [{ kind: "code", label: "Snippet", text: "a" }] }), node("N2")]));
  assert.equal(screen.queryAllByText("Snippet").length, 1);
  await act(async () => {
    location.hash = "#node=N2";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
  assert.equal(screen.queryAllByText("Snippet").length, 0);
  assert.equal(screen.queryAllByText("At the edge").length, 0);
});

test("a decided node shows its decision and can be reopened", () => {
  location.hash = "#node=N1";
  const s = state([node("N1", { status: "decided", choice: choice() })]);
  s.plan!.decisions = [{ nodeId: "N1", optionId: "central", label: "In the API", overrodeRecommendation: false, status: "decided", at: "t" }];
  const { posts } = renderSurface(<DecisionView />, s);
  assert.ok(screen.getByText("In the API", { selector: "b" }));
  fireEvent.click(screen.getByRole("button", { name: "Reopen" }));
  assert.deepEqual(posts.at(-1)?.action, { type: "node.reopen", nodeId: "N1" });
});

test("a read-only page names the session holding the plan and offers to take it over", () => {
  const { posts } = renderSurface(<PlanPage />, state([node("N1")], { readOnly: true, lockHolder: "pi-123-abc" }));
  assert.ok(screen.getByText(/session pi-123-abc is editing this plan/));
  fireEvent.click(screen.getByRole("button", { name: "Take over editing" }));
  assert.deepEqual(posts.at(-1)?.action, { type: "lock.takeOver" });
});
