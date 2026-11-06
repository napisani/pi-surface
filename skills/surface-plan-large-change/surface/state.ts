// A plan for a change too large for one session: a destination, the map of
// questions that stand between here and there, the decisions that settle them,
// the architecture they lead to, and the slices that build it. The Plan is what
// state.json holds; PlanState wraps it with what only this session knows.
import type { PatchOp } from "../../../src/host/patch.ts";
import { add, append, at, child, item, remove, replace } from "../../../src/host/ptr.ts";
import { SurfaceError } from "../../../src/host/workflow.ts";
import { validateVisual, type Graph, type LabeledVisual } from "../../../src/kit/code.ts";
import type { DocComment, DocTarget } from "../../../src/kit/docComments.ts";
import type { Opinion, ReviewerDefaults } from "../../../src/kit/opinion.ts";
import { validateOptionSet, type OptionSet } from "../../../src/kit/options.ts";
import type { ThreadMessage } from "../../../src/kit/thread.ts";

export type NodeType = "discuss" | "research" | "spike" | "task";
export const NODE_TYPES: readonly NodeType[] = ["discuss", "research", "spike", "task"];
export type Mode = "HIL" | "AFK";
export type NodeStatus = "open" | "decided" | "deferred";

export interface RunInfo {
  status: "running" | "done" | "failed";
  note?: string;
  /** Subagent run ids, so corrections can resume the author. */
  runIds: string[];
  /** Spike worktrees the user removes when done with them. */
  worktrees: string[];
  startedAt: string;
  finishedAt?: string;
}

export interface NodeResult {
  markdown: string;
  visuals: LabeledVisual[];
  at: string;
}

export interface PlanNode {
  id: string;
  type: NodeType;
  mode: Mode;
  /** The question, phrased so it can be answered. */
  title: string;
  summary?: string;
  blockedBy: string[];
  /** The fog item it graduated from. */
  fromFog?: string;
  status: NodeStatus;
  /** Options to decide between, for discuss nodes and spikes with results. */
  choice?: OptionSet;
  visuals: LabeledVisual[];
  checklist?: { text: string; done: boolean }[];
  run?: RunInfo;
  result?: NodeResult;
  /** The user's inline comments on the findings. */
  comments?: DocComment[];
  thread: ThreadMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface Decision {
  nodeId: string;
  optionId: string | null;
  label: string;
  note?: string;
  overrodeRecommendation: boolean;
  status: "decided" | "reopened" | "deferred";
  at: string;
}

export interface FogItem {
  id: string;
  text: string;
  /** The node it became; it no longer shows as fog. */
  graduatedTo?: string;
}

export type ChangeKind = "add" | "remove" | "change";

export interface Architecture {
  summary: string;
  current: Graph;
  target: Graph;
  /** Components in both whose role or contract changes. */
  changed: string[];
  /** What each decision does to the architecture. */
  changes: { component: string; kind: ChangeKind; decisions: string[]; note: string }[];
  at: string;
}

export type SliceSize = "S" | "M" | "L" | "XL";
export type SliceStatus = "proposed" | "ready" | "in-progress" | "done" | "blocked";
export const SLICE_STATUSES: readonly SliceStatus[] = ["proposed", "ready", "in-progress", "done", "blocked"];

export interface SliceReport {
  id: string;
  sliceId: string;
  status: "in-progress" | "done" | "blocked";
  note: string;
  /** Assumptions that turned out wrong, and the nodes they touch. */
  deviations: { text: string; nodes: string[] }[];
  from?: string;
  at: string;
  acknowledged: boolean;
}

export interface Slice {
  id: string;
  title: string;
  deliverable: string;
  acceptance: string[];
  /** Modules or paths it changes. */
  touches: string[];
  dependsOn: string[];
  size: SliceSize;
  mode: Mode;
  /** The decided nodes it relies on. */
  decisions: string[];
  /** The brief someone builds it from. Markdown. */
  brief: string;
  status: SliceStatus;
  /** The forge spec designed for it, when one was. */
  forgeSpec?: string;
  /** The user's comments on the brief. */
  comments?: DocComment[];
}

export type ArtifactKind = "rfc" | "architecture" | "decisionLog";
export const ARTIFACT_KINDS: readonly ArtifactKind[] = ["rfc", "architecture", "decisionLog"];
export const ARTIFACT_NAMES = { rfc: "RFC", architecture: "Architecture doc", decisionLog: "Decision log" } satisfies Record<ArtifactKind, string>;

export interface Artifact {
  writing: boolean;
  markdown: string;
  /** The decisions it was written from: node id to option id, or null when decided in words. */
  basis: Record<string, string | null>;
  final: boolean;
  review?: { verdict: "approved" | "changes"; note?: string; at: string };
  at: string;
  /** The user's inline comments; they survive the agent's revisions. */
  comments?: DocComment[];
}

export interface Plan {
  version: 1;
  slug: string;
  title: string;
  /** The repository's name, the directory under the plans root. */
  repo: string;
  /** Other repositories the plan touches. */
  repos: string[];
  destination: string;
  outOfScope: string[];
  fog: FogItem[];
  nodes: PlanNode[];
  decisions: Decision[];
  architecture?: Architecture;
  slices: Slice[];
  slicesApprovedAt?: string;
  reports: SliceReport[];
  artifacts: Partial<Record<ArtifactKind, Artifact>>;
  opinions: Opinion[];
  reviewer: ReviewerDefaults;
  next: { node: number; fog: number; slice: number; report: number };
  createdAt: string;
  updatedAt: string;
}

/** Where a plan lives and the checkout it was opened from. */
export interface PlanRef {
  repo: string;
  slug: string;
  dir: string;
  worktree: string;
}

export interface PlanState {
  version: 1;
  ref: PlanRef | null;
  plan: Plan | null;
  /** Another live session holds the plan's lock; this one only reads and reports. */
  readOnly: boolean;
  lockHolder?: string;
}

export function emptyState(): PlanState {
  return { version: 1, ref: null, plan: null, readOnly: false };
}

export function newPlan(slug: string, title: string, repo: string, now: string): Plan {
  return {
    version: 1,
    slug,
    title,
    repo,
    repos: [],
    destination: "",
    outOfScope: [],
    fog: [],
    nodes: [],
    decisions: [],
    slices: [],
    reports: [],
    artifacts: {},
    opinions: [],
    reviewer: { model: null, prompts: [] },
    next: { node: 1, fog: 1, slice: 1, report: 1 },
    createdAt: now,
    updatedAt: now,
  };
}

const r = at<PlanState>();
export const opinionsPtr = r("plan", "opinions");
export const isArtifactKind = (id: string): id is ArtifactKind => ARTIFACT_KINDS.some((k) => k === id);

/** The plan, or a SurfaceError when none is open or this session may only read it. */
export function writable(state: PlanState): Plan {
  if (!state.plan) {
    throw new SurfaceError("no plan is open; call surface_plan_open first");
  }
  if (state.readOnly) {
    throw new SurfaceError(`another session (${state.lockHolder ?? "unknown"}) is editing this plan; take it over on the page first`);
  }
  return state.plan;
}

export function nodeIndex(plan: Plan, id: string): number {
  const i = plan.nodes.findIndex((n) => n.id === id);
  if (i < 0) {
    throw new SurfaceError(`unknown node "${id}"`);
  }
  return i;
}

export function nodeOf(plan: Plan, id: string): PlanNode {
  return plan.nodes[nodeIndex(plan, id)];
}

const nodePtr = (plan: Plan, id: string) => item(r("plan", "nodes"), nodeIndex(plan, id));
const touch = (now: string) => replace(r("plan", "updatedAt"), now);

/** A node is blocked while any node it waits on is undecided. */
export const isBlocked = (plan: Plan, node: PlanNode) => node.blockedBy.some((id) => plan.nodes.find((n) => n.id === id)?.status !== "decided");

/** Open nodes whose blockers are all decided: what can be worked now. */
export const frontier = (plan: Plan) => plan.nodes.filter((n) => n.status === "open" && !isBlocked(plan, n));

export interface Dependents {
  nodes: string[];
  slices: string[];
}

/** Everything downstream of a node: nodes that wait on it, directly or not, and slices that rely on any of them. */
export function dependents(plan: Plan, id: string): Dependents {
  const found = new Set<string>();
  const queue = [id];
  while (queue.length) {
    const current = queue.shift()!;
    for (const n of plan.nodes) {
      if (n.blockedBy.includes(current) && !found.has(n.id)) {
        found.add(n.id);
        queue.push(n.id);
      }
    }
  }
  const all = new Set([id, ...found]);
  return { nodes: [...found], slices: plan.slices.filter((s) => s.decisions.some((d) => all.has(d))).map((s) => s.id) };
}

// ---- map ----

export interface NodeInput {
  id?: string;
  type: NodeType;
  title: string;
  summary?: string;
  mode?: Mode;
  blockedBy?: string[];
  fromFog?: string;
  checklist?: string[];
}

export interface MapInput {
  title?: string;
  destination?: string;
  outOfScope?: string[];
  repos?: string[];
  fog?: { add?: string[]; remove?: string[] };
  nodes?: NodeInput[];
  removeNodes?: string[];
}

const defaultMode = (type: NodeType): Mode => (type === "research" || type === "spike" ? "AFK" : "HIL");

export interface MapChange {
  ops: PatchOp[];
  /** Ids of the nodes it created. */
  created: string[];
}

function scalarOps(input: MapInput): PatchOp[] {
  const ops: PatchOp[] = [];
  if (input.title !== undefined) {
    ops.push(replace(r("plan", "title"), input.title.trim()));
  }
  if (input.destination !== undefined) {
    ops.push(replace(r("plan", "destination"), input.destination.trim()));
  }
  if (input.outOfScope) {
    ops.push(replace(r("plan", "outOfScope"), input.outOfScope.map((t) => t.trim()).filter(Boolean)));
  }
  if (input.repos) {
    ops.push(replace(r("plan", "repos"), input.repos));
  }
  return ops;
}

/** The working copy of the map an update builds before it is checked as a whole. */
interface Draft {
  nodes: PlanNode[];
  fog: FogItem[];
  next: Plan["next"];
  created: string[];
  errors: string[];
}

function nodeProblem(n: NodeInput, existing: number): string | undefined {
  if (n.id && existing < 0 && !/^N\d+$/.test(n.id)) {
    return `node "${n.id}": new nodes get ids from the plan; omit id to create one`;
  }
  if (!NODE_TYPES.includes(n.type)) {
    return `node "${n.title}": type must be one of ${NODE_TYPES.join(", ")}`;
  }
  return n.title?.trim() ? undefined : "every node needs a title phrased as a question";
}

function buildNode(n: NodeInput, base: PlanNode | undefined, id: string, now: string): PlanNode {
  const node: PlanNode = {
    ...(base ?? { status: "open", visuals: [], thread: [], createdAt: now }),
    id,
    type: n.type,
    mode: n.mode ?? base?.mode ?? defaultMode(n.type),
    title: n.title.trim(),
    blockedBy: n.blockedBy ?? base?.blockedBy ?? [],
    updatedAt: now,
  };
  if (n.summary !== undefined) {
    node.summary = n.summary;
  }
  if (n.checklist) {
    node.checklist = n.checklist.map((text) => ({ text, done: base?.checklist?.find((c) => c.text === text)?.done ?? false }));
  }
  if (n.fromFog) {
    node.fromFog = n.fromFog;
  }
  return node;
}

function mergeNode(draft: Draft, n: NodeInput, now: string): void {
  const existing = n.id ? draft.nodes.findIndex((x) => x.id === n.id) : -1;
  const problem = nodeProblem(n, existing);
  if (problem) {
    draft.errors.push(problem);
    return;
  }
  const base = existing >= 0 ? draft.nodes[existing] : undefined;
  const id = base?.id ?? `N${draft.next.node++}`;
  const node = buildNode(n, base, id, now);
  if (n.fromFog) {
    const f = draft.fog.findIndex((x) => x.id === n.fromFog);
    if (f < 0) {
      draft.errors.push(`node "${n.title}": no fog item "${n.fromFog}"`);
    } else {
      draft.fog[f] = { ...draft.fog[f], graduatedTo: id };
    }
  }
  if (base) {
    draft.nodes[existing] = node;
  } else {
    draft.nodes.push(node);
    draft.created.push(id);
  }
}

function blockingErrors(nodes: readonly PlanNode[]): string[] {
  const ids = new Set(nodes.map((n) => n.id));
  const errors = nodes.flatMap((n) => n.blockedBy.flatMap((b) => [...(ids.has(b) ? [] : [`${n.id} is blocked by "${b}", which is not a node`]), ...(b === n.id ? [`${n.id} cannot block itself`] : [])]));
  const cycle = findCycle(nodes);
  return cycle ? [...errors, `blocking cycle: ${cycle.join(" -> ")}`] : errors;
}

/** Ops for the agent's changes to the map. */
export function updateMap(state: PlanState, input: MapInput, now: string): MapChange {
  const plan = writable(state);
  const draft: Draft = {
    nodes: plan.nodes.filter((n) => !input.removeNodes?.includes(n.id)),
    fog: plan.fog.filter((f) => !input.fog?.remove?.includes(f.id)),
    next: { ...plan.next },
    created: [],
    errors: [],
  };
  for (const text of input.fog?.add ?? []) {
    if (text.trim()) {
      draft.fog.push({ id: `F${draft.next.fog++}`, text: text.trim() });
    }
  }
  for (const n of input.nodes ?? []) {
    mergeNode(draft, n, now);
  }
  const errors = [...draft.errors, ...blockingErrors(draft.nodes)];
  if (errors.length) {
    throw new SurfaceError(`invalid map change:\n- ${errors.join("\n- ")}`);
  }
  const ops = [...scalarOps(input), replace(r("plan", "fog"), draft.fog), replace(r("plan", "nodes"), draft.nodes), replace(r("plan", "next"), draft.next), touch(now)];
  return { ops, created: draft.created };
}

function findCycle(nodes: readonly PlanNode[]): string[] | undefined {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const state = new Map<string, "open" | "done">();
  const path: string[] = [];
  const walk = (id: string): string[] | undefined => {
    if (state.get(id) === "open") {
      return [...path.slice(path.indexOf(id)), id];
    }
    if (state.get(id) === "done") {
      return undefined;
    }
    state.set(id, "open");
    path.push(id);
    for (const b of byId.get(id)?.blockedBy ?? []) {
      const found = walk(b);
      if (found) {
        return found;
      }
    }
    path.pop();
    state.set(id, "done");
    return undefined;
  };
  for (const n of nodes) {
    const found = walk(n.id);
    if (found) {
      return found;
    }
  }
  return undefined;
}

/** Ops for the user's own edits to the destination, out of scope and fog. */
export function editScope(state: PlanState, edit: { destination?: string; addOutOfScope?: string; removeOutOfScope?: number; addFog?: string; removeFog?: string }, now: string): PatchOp[] {
  const plan = writable(state);
  const ops: PatchOp[] = [];
  if (edit.destination !== undefined) {
    ops.push(replace(r("plan", "destination"), edit.destination.trim()));
  }
  if (edit.addOutOfScope?.trim()) {
    ops.push(append(r("plan", "outOfScope"), edit.addOutOfScope.trim()));
  }
  if (edit.removeOutOfScope !== undefined) {
    if (!plan.outOfScope[edit.removeOutOfScope]) {
      throw new SurfaceError("no such out-of-scope item");
    }
    ops.push(remove(item(r("plan", "outOfScope"), edit.removeOutOfScope)));
  }
  if (edit.addFog?.trim()) {
    ops.push(append(r("plan", "fog"), { id: `F${plan.next.fog}`, text: edit.addFog.trim() }), replace(r("plan", "next", "fog"), plan.next.fog + 1));
  }
  if (edit.removeFog) {
    const i = plan.fog.findIndex((f) => f.id === edit.removeFog);
    if (i < 0) {
      throw new SurfaceError(`no fog item "${edit.removeFog}"`);
    }
    ops.push(remove(item(r("plan", "fog"), i)));
  }
  return [...ops, touch(now)];
}

// ---- nodes ----

export function checkVisuals(visuals: readonly LabeledVisual[], what: string): void {
  const errors = visuals.flatMap((v, i) => validateVisual(v, `${what} visual[${i}]`, { label: true }));
  if (errors.length) {
    throw new SurfaceError(`invalid visuals:\n- ${errors.join("\n- ")}`);
  }
}

/** Ops that put options on a node for the user to decide between. */
export function askNode(state: PlanState, nodeId: string, choice: OptionSet, now: string): PatchOp[] {
  const plan = writable(state);
  const node = nodeOf(plan, nodeId);
  if (node.type === "task") {
    throw new SurfaceError(`${nodeId} is a task node; it is settled by its steps, not options`);
  }
  if (node.status === "decided") {
    throw new SurfaceError(`${nodeId} is decided; the user reopens it first`);
  }
  const errors = validateOptionSet(choice);
  if (errors.length) {
    throw new SurfaceError(`invalid options for ${nodeId}:\n- ${errors.join("\n- ")}`);
  }
  const p = nodePtr(plan, nodeId);
  const recommended = choice.options.find((o) => o.recommended);
  const note: ThreadMessage = { role: "agent", text: `Proposed ${choice.options.length} options${recommended ? `; I recommend ${recommended.label}` : ""}. Pick one above.`, at: now };
  return [add(child(p, "choice"), structuredClone(choice)), replace(child(p, "status"), "open"), append(child(p, "thread"), note), replace(child(p, "updatedAt"), now), touch(now)];
}

export type WorkKind = "options" | "deeper" | "research" | "spike" | "propose";

const WORK_ASKED = {
  options: "Asked for options to decide between",
  deeper: "Asked the agent to go deeper",
  research: "Asked an agent to research this",
  spike: "Asked agents to spike the approaches",
  propose: "Asked the agent to propose a decision from the findings",
} satisfies Record<WorkKind, string>;

/** Ops that record the user's request in the node's thread, so the page shows the agent owes an answer. */
export function requestWork(state: PlanState, nodeId: string, kind: WorkKind, focus: string | undefined, now: string): PatchOp[] {
  const plan = writable(state);
  const node = nodeOf(plan, nodeId);
  if (node.status !== "open") {
    throw new SurfaceError(`${nodeId} is ${node.status}; reopen it first`);
  }
  if (kind === "propose" && !node.result) {
    throw new SurfaceError(`${nodeId} has no findings to propose a decision from yet`);
  }
  const text = focus ? `${WORK_ASKED[kind]}: ${focus}` : `${WORK_ASKED[kind]}.`;
  return [append(child(nodePtr(plan, nodeId), "thread"), { role: "user", text, at: now }), touch(now)];
}

export interface NodeUpdate {
  text?: string;
  visuals?: LabeledVisual[];
  run?: { status: "running" | "done" | "failed"; note?: string; runIds?: string[]; worktrees?: string[] };
  result?: { markdown: string; visuals?: LabeledVisual[] };
}

/** A node's AFK run after an update: ids and worktrees accumulate across reports. */
function nextRun(node: PlanNode, update: NonNullable<NodeUpdate["run"]>, now: string): RunInfo {
  const run: RunInfo = {
    status: update.status,
    runIds: [...new Set([...(node.run?.runIds ?? []), ...(update.runIds ?? [])])],
    worktrees: [...new Set([...(node.run?.worktrees ?? []), ...(update.worktrees ?? [])])],
    startedAt: node.run?.status === "running" ? node.run.startedAt : now,
  };
  if (update.note) {
    run.note = update.note;
  }
  if (update.status !== "running") {
    run.finishedAt = now;
  }
  return run;
}

/** Ops for the agent's reply, AFK run progress, or result on a node. */
export function updateNode(state: PlanState, nodeId: string, update: NodeUpdate, now: string): PatchOp[] {
  const plan = writable(state);
  const node = nodeOf(plan, nodeId);
  const p = nodePtr(plan, nodeId);
  const ops: PatchOp[] = [];
  if (update.visuals?.length) {
    checkVisuals(update.visuals, nodeId);
    ops.push(...update.visuals.map((v) => append(child(p, "visuals"), structuredClone(v))));
  }
  if (update.text?.trim()) {
    ops.push(append(child(p, "thread"), { role: "agent", text: update.text.trim(), at: now }));
  }
  if (update.run) {
    ops.push(add(child(p, "run"), nextRun(node, update.run, now)));
    if (update.run.status === "running" && node.run?.status !== "running") {
      ops.push(append(child(p, "thread"), { role: "agent", text: `Started${update.run.note ? `: ${update.run.note}` : "."}`, at: now }));
    }
    if (update.run.status === "failed") {
      ops.push(append(child(p, "thread"), { role: "agent", text: `The run failed${update.run.note ? `: ${update.run.note}` : "."}`, at: now }));
    }
  }
  if (update.result) {
    if (!update.result.markdown.trim()) {
      throw new SurfaceError("a result needs markdown");
    }
    checkVisuals(update.result.visuals ?? [], `${nodeId} result`);
    ops.push(add(child(p, "result"), { markdown: update.result.markdown, visuals: structuredClone(update.result.visuals ?? []), at: now }));
    if (!update.text?.trim()) {
      ops.push(append(child(p, "thread"), { role: "agent", text: "The findings are in.", at: now }));
    }
  }
  if (!ops.length) {
    throw new SurfaceError("give text, visuals, a run update or a result");
  }
  return [...ops, replace(child(p, "updatedAt"), now), touch(now)];
}

function putDecision(plan: Plan, decision: Decision): PatchOp {
  const i = plan.decisions.findIndex((d) => d.nodeId === decision.nodeId);
  return i < 0 ? append(r("plan", "decisions"), decision) : replace(item(r("plan", "decisions"), i), decision);
}

/** Ops for the user's decision: an option, or words when the node has none. */
export function decide(state: PlanState, nodeId: string, input: { optionId?: string; text?: string; note?: string }, now: string): PatchOp[] {
  const plan = writable(state);
  const node = nodeOf(plan, nodeId);
  if (node.status === "decided") {
    throw new SurfaceError(`${nodeId} is already decided`);
  }
  if (isBlocked(plan, node)) {
    throw new SurfaceError(`${nodeId} waits on ${node.blockedBy.filter((b) => plan.nodes.find((n) => n.id === b)?.status !== "decided").join(", ")}`);
  }
  if (node.checklist?.some((c) => !c.done)) {
    throw new SurfaceError(`${nodeId} has unchecked steps`);
  }
  let decision: Decision;
  if (input.optionId) {
    const option = node.choice?.options.find((o) => o.id === input.optionId);
    if (!option) {
      throw new SurfaceError(`${nodeId} has no option "${input.optionId}"`);
    }
    const recommended = node.choice?.options.find((o) => o.recommended);
    decision = { nodeId, optionId: option.id, label: option.label, overrodeRecommendation: Boolean(recommended && recommended.id !== option.id), status: "decided", at: now };
  } else {
    if (node.choice && !input.text?.trim()) {
      throw new SurfaceError(`pick one of ${nodeId}'s options`);
    }
    const text = input.text?.trim() || (node.type === "task" ? "Done" : "");
    if (!text) {
      throw new SurfaceError("say what was decided");
    }
    decision = { nodeId, optionId: null, label: text, overrodeRecommendation: false, status: "decided", at: now };
  }
  if (input.note?.trim()) {
    decision.note = input.note.trim();
  }
  const p = nodePtr(plan, nodeId);
  return [replace(child(p, "status"), "decided"), replace(child(p, "updatedAt"), now), putDecision(plan, decision), touch(now)];
}

export function defer(state: PlanState, nodeId: string, now: string): PatchOp[] {
  const plan = writable(state);
  const node = nodeOf(plan, nodeId);
  if (node.status !== "open") {
    throw new SurfaceError(`${nodeId} is not open`);
  }
  const p = nodePtr(plan, nodeId);
  return [replace(child(p, "status"), "deferred"), putDecision(plan, { nodeId, optionId: null, label: "Deferred", overrodeRecommendation: false, status: "deferred", at: now }), touch(now)];
}

/** Ops that reopen a decided or deferred node; its dependents are named in the message the caller sends. */
export function reopen(state: PlanState, nodeId: string, now: string): PatchOp[] {
  const plan = writable(state);
  const node = nodeOf(plan, nodeId);
  if (node.status === "open") {
    throw new SurfaceError(`${nodeId} is already open`);
  }
  const di = plan.decisions.findIndex((d) => d.nodeId === nodeId);
  const p = nodePtr(plan, nodeId);
  return [replace(child(p, "status"), "open"), replace(child(p, "updatedAt"), now), ...(di < 0 ? [] : [replace(r("plan", "decisions", di, "status"), "reopened")]), touch(now)];
}

export function askAbout(state: PlanState, nodeId: string, text: string, now: string): PatchOp[] {
  const plan = writable(state);
  return [append(child(nodePtr(plan, nodeId), "thread"), { role: "user", text: text.trim(), at: now }), touch(now)];
}

export function checkStep(state: PlanState, nodeId: string, index: number, done: boolean, now: string): PatchOp[] {
  const plan = writable(state);
  const node = nodeOf(plan, nodeId);
  if (!node.checklist?.[index]) {
    throw new SurfaceError(`${nodeId} has no step ${index + 1}`);
  }
  return [replace(child(item(child(nodePtr(plan, nodeId), "checklist"), index), "done"), done), touch(now)];
}

/** Decided nodes keyed by id; an artifact records this to show when it went stale. */
export function decisionBasis(plan: Plan): Record<string, string | null> {
  return Object.fromEntries(plan.decisions.filter((d) => d.status === "decided").map((d) => [d.nodeId, d.optionId]));
}

// ---- architecture ----

export function setArchitecture(state: PlanState, input: Omit<Architecture, "at">, now: string): PatchOp[] {
  writable(state);
  checkVisuals([{ kind: "archDiff", label: "architecture", before: input.current, after: input.target, changed: input.changed }], "architecture");
  return [add(r("plan", "architecture"), { ...structuredClone(input), at: now }), touch(now)];
}

// ---- slices ----

export type SliceInput = Omit<Slice, "id" | "status"> & { id?: string; status?: SliceStatus };

/** Ops that propose or revise the slice graph; a revision clears its approval. */
export function setSlices(state: PlanState, inputs: SliceInput[], now: string): PatchOp[] {
  const plan = writable(state);
  const errors: string[] = [];
  let next = plan.next.slice;
  const slices: Slice[] = inputs.map((s) => {
    const existing = s.id ? plan.slices.find((x) => x.id === s.id) : undefined;
    const id = existing?.id ?? `S${next++}`;
    const slice: Slice = { ...structuredClone(s), id, status: s.status ?? existing?.status ?? "proposed" };
    if (existing?.forgeSpec && !slice.forgeSpec) {
      slice.forgeSpec = existing.forgeSpec;
    }
    if (existing?.comments) {
      slice.comments = existing.comments;
    }
    return slice;
  });
  const ids = new Set(slices.map((s) => s.id));
  for (const s of slices) {
    if (!s.title?.trim() || !s.deliverable?.trim()) {
      errors.push(`${s.id}: needs a title and a deliverable`);
    }
    if (!s.acceptance?.length) {
      errors.push(`${s.id}: needs acceptance criteria`);
    }
    for (const d of s.dependsOn) {
      if (!ids.has(d)) {
        errors.push(`${s.id} depends on "${d}", which is not a slice`);
      }
    }
    for (const n of s.decisions) {
      if (!plan.nodes.some((x) => x.id === n)) {
        errors.push(`${s.id} relies on "${n}", which is not a node`);
      }
    }
  }
  if (errors.length) {
    throw new SurfaceError(`invalid slices:\n- ${errors.join("\n- ")}`);
  }
  const ops = [replace(r("plan", "slices"), slices), replace(r("plan", "next", "slice"), next), touch(now)];
  if (plan.slicesApprovedAt) {
    ops.push(remove(r("plan", "slicesApprovedAt")));
  }
  return ops;
}

export function approveSlices(state: PlanState, now: string): PatchOp[] {
  const plan = writable(state);
  if (!plan.slices.length) {
    throw new SurfaceError("there are no slices to approve");
  }
  const ops: PatchOp[] = [add(r("plan", "slicesApprovedAt"), now), touch(now)];
  plan.slices.forEach((s, i) => {
    if (s.status === "proposed") {
      ops.push(replace(r("plan", "slices", i, "status"), "ready"));
    }
  });
  return ops;
}

export function setSliceStatus(state: PlanState, sliceId: string, status: SliceStatus, now: string): PatchOp[] {
  const plan = writable(state);
  const i = plan.slices.findIndex((s) => s.id === sliceId);
  if (i < 0) {
    throw new SurfaceError(`unknown slice "${sliceId}"`);
  }
  return [replace(r("plan", "slices", i, "status"), status), touch(now)];
}

export function setForgeSpec(state: PlanState, sliceId: string, path: string, now: string): PatchOp[] {
  const plan = writable(state);
  const i = plan.slices.findIndex((s) => s.id === sliceId);
  if (i < 0) {
    throw new SurfaceError(`unknown slice "${sliceId}"`);
  }
  return [add(r("plan", "slices", i, "forgeSpec"), path), touch(now)];
}

export type ReportInput = Omit<SliceReport, "id" | "acknowledged">;

/** Ops that take in reports other sessions sent; a report on an unknown slice is kept, flagged in its note. */
export function ingestReports(state: PlanState, reports: readonly ReportInput[], now: string): PatchOp[] {
  const plan = writable(state);
  if (!reports.length) {
    return [];
  }
  let next = plan.next.report;
  const ops: PatchOp[] = [];
  for (const report of reports) {
    const known = plan.slices.findIndex((s) => s.id === report.sliceId);
    const note = known < 0 ? `${report.note} (no slice ${report.sliceId} in this plan)` : report.note;
    ops.push(append(r("plan", "reports"), { ...structuredClone(report), note, id: `P${next++}`, acknowledged: false }));
    if (known >= 0) {
      ops.push(replace(r("plan", "slices", known, "status"), report.status));
    }
  }
  return [...ops, replace(r("plan", "next", "report"), next), touch(now)];
}

export function acknowledgeReport(state: PlanState, reportId: string, now: string): PatchOp[] {
  const plan = writable(state);
  const i = plan.reports.findIndex((p) => p.id === reportId);
  if (i < 0) {
    throw new SurfaceError(`unknown report "${reportId}"`);
  }
  return [replace(r("plan", "reports", i, "acknowledged"), true), touch(now)];
}

// ---- artifacts ----

export function requestArtifact(state: PlanState, kind: ArtifactKind, now: string): PatchOp[] {
  const plan = writable(state);
  const previous = plan.artifacts[kind];
  return [add(r("plan", "artifacts", kind), { ...(previous ?? { markdown: "", basis: {}, final: false, at: now }), writing: true }), touch(now)];
}

export function postArtifact(state: PlanState, kind: ArtifactKind, markdown: string, final: boolean, now: string): PatchOp[] {
  const plan = writable(state);
  if (!markdown.trim()) {
    throw new SurfaceError("an artifact needs markdown");
  }
  const artifact: Artifact = { writing: false, markdown, basis: decisionBasis(plan), final, at: now, comments: plan.artifacts[kind]?.comments ?? [] };
  return [add(r("plan", "artifacts", kind), artifact), touch(now)];
}

export function reviewArtifact(state: PlanState, kind: ArtifactKind, verdict: "approved" | "changes", note: string | undefined, now: string): PatchOp[] {
  const plan = writable(state);
  const artifact = plan.artifacts[kind];
  if (!artifact?.final || artifact.writing) {
    throw new SurfaceError(`no final ${ARTIFACT_NAMES[kind]} is waiting for review`);
  }
  if (verdict === "changes" && !note?.trim()) {
    throw new SurfaceError("say what to change");
  }
  const review: Artifact["review"] = { verdict, at: now };
  if (note?.trim()) {
    review.note = note.trim();
  }
  return [add(r("plan", "artifacts", kind, "review"), review), touch(now)];
}

// ---- reviewer defaults ----

export function setReviewer(state: PlanState, input: { model?: string; savePrompt?: { name: string; text: string }; removePrompt?: string }, now: string): PatchOp[] {
  const plan = writable(state);
  const ops: PatchOp[] = [];
  if (input.model !== undefined) {
    ops.push(replace(r("plan", "reviewer", "model"), input.model || null));
  }
  if (input.savePrompt) {
    const name = input.savePrompt.name.trim();
    if (!name || !input.savePrompt.text.trim()) {
      throw new SurfaceError("a saved prompt needs a name and text");
    }
    const prompts = [...plan.reviewer.prompts.filter((p) => p.name !== name), { name, text: input.savePrompt.text.trim() }];
    ops.push(replace(r("plan", "reviewer", "prompts"), prompts));
  }
  if (input.removePrompt) {
    ops.push(replace(r("plan", "reviewer", "prompts"), plan.reviewer.prompts.filter((p) => p.name !== input.removePrompt)));
  }
  return [...ops, touch(now)];
}

// ---- documents ----

/** The plan's documents the page renders richly: artifacts and slice briefs (editable) and node findings (read-only). */
export function planDoc(state: PlanState, kind: string, id: string, dir: string): DocTarget<PlanState> {
  const plan = writable(state);
  if (kind === "artifact") {
    if (!isArtifactKind(id) || !plan.artifacts[id]?.markdown) {
      throw new SurfaceError(`there is no ${isArtifactKind(id) ? ARTIFACT_NAMES[id] : id} yet`);
    }
    const artifact = plan.artifacts[id]!;
    return {
      label: `the ${ARTIFACT_NAMES[id]}`,
      markdown: artifact.markdown,
      comments: artifact.comments ?? [],
      list: r("plan", "artifacts", id, "comments"),
      ensure: artifact.comments ? [] : [add(r("plan", "artifacts", id, "comments"), [])],
      brief: { content: `${dir}/artifacts/${id}.md`, revise: `edit it and republish it with surface_plan_artifact kind "${id}".` },
      save: (markdown, now) => [replace(r("plan", "artifacts", id, "markdown"), markdown), touch(now)],
    };
  }
  if (kind === "slice") {
    const i = plan.slices.findIndex((s) => s.id === id);
    if (i < 0) {
      throw new SurfaceError(`unknown slice "${id}"`);
    }
    const slice = plan.slices[i];
    return {
      label: `the brief for ${slice.id} ${slice.title}`,
      markdown: slice.brief,
      comments: slice.comments ?? [],
      list: r("plan", "slices", i, "comments"),
      ensure: slice.comments ? [] : [add(r("plan", "slices", i, "comments"), [])],
      brief: { content: `${dir}/slices/${slice.id}.md (the Brief section)`, revise: `republish the slices with surface_plan_slices, keeping id "${slice.id}" and changing its brief.` },
      save: (markdown, now) => [replace(r("plan", "slices", i, "brief"), markdown), touch(now)],
    };
  }
  if (kind === "finding") {
    const node = nodeOf(plan, id);
    if (!node.result) {
      throw new SurfaceError(`${id} has no findings yet`);
    }
    const p = nodePtr(plan, id);
    const authors = node.run?.runIds.length ? ` They came from subagent run(s) ${node.run.runIds.join(", ")}; resume them for the revision.` : "";
    return {
      label: `the findings on ${node.id} ${node.title}`,
      markdown: node.result.markdown,
      comments: node.comments ?? [],
      list: child(p, "comments"),
      ensure: node.comments ? [] : [add(child(p, "comments"), [])],
      brief: { content: `the findings on ${node.id} in ${dir}/decisions/${node.id}.md`, revise: `republish them with surface_plan_node result.${authors}` },
    };
  }
  throw new SurfaceError(`no plan document of kind "${kind}"`);
}

/** Every comment on every plan document, so new ids stay unique. */
export function allDocComments(plan: Plan): DocComment[] {
  return [...ARTIFACT_KINDS.flatMap((k) => plan.artifacts[k]?.comments ?? []), ...plan.slices.flatMap((s) => s.comments ?? []), ...plan.nodes.flatMap((n) => n.comments ?? [])];
}
