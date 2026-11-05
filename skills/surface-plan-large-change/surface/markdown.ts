// The plan's markdown views, regenerated from state.json on every save so
// people, grep and other agents can read a plan without the page. Pure, so the
// Node tests cover it.
import type { Graph } from "../../../src/kit/code.ts";
import { frontier, isBlocked, type Plan, type PlanNode, type Slice } from "./state.ts";

const GENERATED = "<!-- Generated from state.json by surface-plan-large-change. Edits here are overwritten; change the plan on its page. -->";

function nodeState(plan: Plan, node: PlanNode): string {
  if (node.status !== "open") {
    return node.status;
  }
  return isBlocked(plan, node) ? `blocked by ${node.blockedBy.join(", ")}` : "frontier";
}

const bullet = (items: readonly string[], empty: string) => (items.length ? items.map((i) => `- ${i}`).join("\n") : `_${empty}_`);

function renderMap(plan: Plan): string {
  const decided = plan.decisions.filter((d) => d.status === "decided");
  const fog = plan.fog.filter((f) => !f.graduatedTo);
  return [
    GENERATED,
    `# ${plan.title}`,
    "",
    "## Destination",
    plan.destination || "_not named yet_",
    "",
    "## Frontier",
    bullet(frontier(plan).map((n) => `${n.id} · ${n.type} · ${n.mode}: ${n.title}`), "nothing open and unblocked"),
    "",
    "## Decisions so far",
    bullet(decided.map((d) => `${d.nodeId}: ${d.label}${d.note ? ` — ${d.note}` : ""} ([detail](decisions/${d.nodeId}.md))`), "none yet"),
    "",
    "## All nodes",
    bullet(plan.nodes.map((n) => `${n.id} · ${n.type} · ${n.mode} · ${nodeState(plan, n)}: ${n.title}`), "none yet"),
    "",
    "## Not yet specified (fog)",
    bullet(fog.map((f) => `${f.id}: ${f.text}`), "no fog"),
    "",
    "## Out of scope",
    bullet(plan.outOfScope, "nothing named"),
    "",
    "## Slices",
    bullet(plan.slices.map((s) => `${s.id} · ${s.status} · ${s.size}: ${s.title} ([brief](slices/${s.id}.md))`), "not broken down yet"),
    "",
  ].join("\n");
}

function renderDecision(plan: Plan, node: PlanNode): string {
  const decision = plan.decisions.find((d) => d.nodeId === node.id);
  const lines = [GENERATED, `# ${node.id}: ${node.title}`, "", `Type: ${node.type} · ${node.mode} · ${nodeState(plan, node)}`];
  if (node.blockedBy.length) {
    lines.push(`Waits on: ${node.blockedBy.join(", ")}`);
  }
  if (node.summary) {
    lines.push("", node.summary);
  }
  if (node.choice) {
    lines.push("", "## Options");
    for (const o of node.choice.options) {
      lines.push("", `### ${o.label}${o.recommended ? " (recommended)" : ""}`, o.description, "", `Pros: ${o.pros.join("; ")}`, `Cons: ${o.cons.join("; ")}`);
      const scores = node.choice.dimensions.map((d) => `${d.label} ${o.scores[d.id]?.value ?? "?"}/5`);
      if (scores.length) {
        lines.push(`Scores: ${scores.join(", ")}`);
      }
    }
  }
  if (node.result) {
    lines.push("", "## Findings", node.result.markdown);
  }
  if (node.checklist?.length) {
    lines.push("", "## Steps", ...node.checklist.map((c) => `- [${c.done ? "x" : " "}] ${c.text}`));
  }
  if (decision) {
    lines.push("", "## Decision", `${decision.status === "decided" ? decision.label : decision.status}${decision.overrodeRecommendation ? " (overrode the recommendation)" : ""}`);
    if (decision.note) {
      lines.push("", decision.note);
    }
    lines.push("", `Decided ${decision.at}`);
  }
  return `${lines.join("\n")}\n`;
}

function renderSlice(plan: Plan, slice: Slice): string {
  const decisions = slice.decisions.map((id) => {
    const d = plan.decisions.find((x) => x.nodeId === id && x.status === "decided");
    const node = plan.nodes.find((n) => n.id === id);
    return `${id}: ${node?.title ?? "?"} → ${d ? d.label : "not decided"}`;
  });
  return [
    GENERATED,
    `# ${slice.id}: ${slice.title}`,
    "",
    `Plan: ${plan.title} · status ${slice.status} · size ${slice.size} · ${slice.mode}`,
    slice.dependsOn.length ? `Depends on: ${slice.dependsOn.join(", ")}` : "Depends on: nothing",
    "",
    "## Deliverable",
    slice.deliverable,
    "",
    "## Acceptance criteria",
    bullet(slice.acceptance, "none"),
    "",
    "## Touches",
    bullet(slice.touches, "not named"),
    "",
    "## Decisions it relies on",
    bullet(decisions, "none"),
    "",
    "## Brief",
    slice.brief,
    "",
    ...(slice.forgeSpec ? ["## Spec", `Designed in forge: ${slice.forgeSpec}`, ""] : []),
    "## Reporting back",
    `When you start, finish, or find an assumption here was wrong, call surface_plan_slice_report with plan "${plan.slug}" and sliceId "${slice.id}".`,
    "",
  ].join("\n");
}

const graphList = (graph: Graph) => bullet(graph.nodes.map((n) => `${n.label}${n.group ? ` (${n.group})` : ""}`), "empty");

function renderArchitecture(plan: Plan): string | undefined {
  const a = plan.architecture;
  if (!a) {
    return undefined;
  }
  return [
    GENERATED,
    `# Architecture: ${plan.title}`,
    "",
    a.summary,
    "",
    "## Current components",
    graphList(a.current),
    "",
    "## Target components",
    graphList(a.target),
    "",
    "## Changes",
    bullet(a.changes.map((c) => `${c.kind} ${c.component}${c.decisions.length ? ` (${c.decisions.join(", ")})` : ""}: ${c.note}`), "none listed"),
    "",
  ].join("\n");
}

/** Every generated file, keyed by its path inside the plan directory. */
export function renderPlanFiles(plan: Plan): Map<string, string> {
  const files = new Map<string, string>([["map.md", renderMap(plan)]]);
  for (const node of plan.nodes) {
    files.set(`decisions/${node.id}.md`, renderDecision(plan, node));
  }
  for (const slice of plan.slices) {
    files.set(`slices/${slice.id}.md`, renderSlice(plan, slice));
  }
  const architecture = renderArchitecture(plan);
  if (architecture) {
    files.set("architecture.md", architecture);
  }
  return files;
}
