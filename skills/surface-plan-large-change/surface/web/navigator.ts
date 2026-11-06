// How the Decision tab lists a plan's nodes: grouped by what each needs next,
// and the neighborhood of one node. Pure, so the Node tests cover it.
import type { Graph } from "../../../../src/kit/code.ts";
import { isBlocked, type Plan, type PlanNode } from "../state.ts";

export type NodeGroup = "you" | "running" | "agents" | "waiting" | "decided" | "deferred";

export const GROUP_LABEL = {
  you: "Needs your decision",
  running: "Agents working",
  agents: "Ready for an agent",
  waiting: "Waiting on other decisions",
  decided: "Decided",
  deferred: "Deferred",
} satisfies Record<NodeGroup, string>;

export const GROUP_ORDER: readonly NodeGroup[] = ["you", "running", "agents", "waiting", "decided", "deferred"];

/** The agent owes this node something: a run in flight, or the user's last message unanswered. */
export function awaitingAgent(node: PlanNode): boolean {
  return node.run?.status === "running" || node.thread.at(-1)?.role === "user";
}

export function groupOf(plan: Plan, node: PlanNode): NodeGroup {
  if (node.status === "decided") {
    return "decided";
  }
  if (node.status === "deferred") {
    return "deferred";
  }
  if (awaitingAgent(node)) {
    return "running";
  }
  if (isBlocked(plan, node)) {
    return "waiting";
  }
  return node.mode === "AFK" && !node.choice && !node.result ? "agents" : "you";
}

/** One short line saying where a node stands. */
export function statusLine(plan: Plan, node: PlanNode): string {
  const group = groupOf(plan, node);
  if (group === "decided") {
    return `✓ ${plan.decisions.find((d) => d.nodeId === node.id && d.status === "decided")?.label ?? "decided"}`;
  }
  if (group === "waiting") {
    return `waits on ${openBlockers(plan, node).join(", ")}`;
  }
  if (group === "you") {
    if (node.choice) {
      return `${node.choice.options.length} options to choose from`;
    }
    return node.result ? "findings in; the agent can propose a decision" : "needs options or a decision";
  }
  return { running: (node.run?.status === "running" ? node.run.note : undefined) ?? "asked; waiting for the agent", agents: `not started; start the ${node.type}`, deferred: "deferred" }[group];
}

export const openBlockers = (plan: Plan, node: PlanNode) => node.blockedBy.filter((b) => plan.nodes.find((n) => n.id === b)?.status !== "decided");

/** Nodes that list this one among their blockers. */
export const unblocks = (plan: Plan, id: string) => plan.nodes.filter((n) => n.blockedBy.includes(id));

export function groupNodes(plan: Plan, filter = ""): { group: NodeGroup; nodes: PlanNode[] }[] {
  const needle = filter.trim().toLowerCase();
  const matches = (n: PlanNode) => !needle || n.id.toLowerCase() === needle || `${n.id} ${n.title}`.toLowerCase().includes(needle);
  return GROUP_ORDER.map((group) => ({ group, nodes: plan.nodes.filter((n) => matches(n) && groupOf(plan, n) === group) })).filter((g) => g.nodes.length);
}

const TONE = { you: "open", running: "active", agents: "open", waiting: "blocked", decided: "done", deferred: "muted" } as const satisfies Record<NodeGroup, string>;

/** The node, what it waits on and what waits on it, two steps each way. */
export function neighborhood(plan: Plan, id: string, depth = 2): Graph {
  const byId = new Map(plan.nodes.map((n) => [n.id, n]));
  const keep = new Set([id]);
  let up = [id];
  let down = [id];
  for (let step = 0; step < depth; step++) {
    up = up.flatMap((x) => byId.get(x)?.blockedBy ?? []).filter((x) => !keep.has(x));
    down = down.flatMap((x) => unblocks(plan, x).map((n) => n.id)).filter((x) => !keep.has(x));
    for (const x of [...up, ...down]) {
      keep.add(x);
    }
  }
  const nodes = plan.nodes.filter((n) => keep.has(n.id));
  return {
    nodes: nodes.map((n) => ({ id: n.id, label: `${n.id} ${n.title}`, tone: n.id === id ? "active" : TONE[groupOf(plan, n)], note: statusLine(plan, n) })),
    edges: nodes.flatMap((n) => n.blockedBy.filter((b) => keep.has(b)).map((b) => ({ from: b, to: n.id }))),
  };
}

export type Step = "blocked" | "working" | "start" | "findings" | "choose" | "ask" | "task";

/** What the user should do next on an open node. */
export function nextStep(plan: Plan, node: PlanNode): Step {
  if (awaitingAgent(node)) {
    return "working";
  }
  if (isBlocked(plan, node)) {
    return "blocked";
  }
  if (node.type === "task") {
    return "task";
  }
  if (node.choice) {
    return "choose";
  }
  if (node.result) {
    return "findings";
  }
  return node.mode === "AFK" ? "start" : "ask";
}
