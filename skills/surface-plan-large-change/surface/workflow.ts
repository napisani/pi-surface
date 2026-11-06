import { Type } from "typebox";
import { defineSurfaceTool, defineWorkflow } from "../../../src/host/workflow.ts";
import { docTools } from "../../../src/kit/docTools.ts";
import { opinionTools } from "../../../src/kit/opinionTools.ts";
import { Dimension, Graph, LabeledVisual, Lens, OptionFields } from "../../../src/kit/schemas.ts";
import { parseAction, type PlanAction } from "./actions.ts";
import { PlanSession } from "./session.ts";
import { ARTIFACT_NAMES, emptyState, frontier, isBlocked, type Plan, type PlanState } from "./state.ts";

const NodeType = Type.Union([Type.Literal("discuss"), Type.Literal("research"), Type.Literal("spike"), Type.Literal("task")], {
  description: "discuss: settled by the user choosing between options. research: an AFK subagent finds facts. spike: AFK subagents build each approach in worktrees to compare. task: manual work that unblocks a decision.",
});
const Mode = Type.Union([Type.Literal("HIL"), Type.Literal("AFK")]);

function summary(plan: Plan): string {
  const open = frontier(plan);
  const blocked = plan.nodes.filter((n) => n.status === "open" && isBlocked(plan, n));
  const fog = plan.fog.filter((f) => !f.graduatedTo);
  const reports = plan.reports.filter((p) => !p.acknowledged);
  return [
    `Destination: ${plan.destination || "(not named yet)"}`,
    `Frontier: ${open.map((n) => `${n.id} [${n.type}] ${n.title}`).join("; ") || "empty"}`,
    `Blocked: ${blocked.length} · decided: ${plan.decisions.filter((d) => d.status === "decided").length} · fog: ${fog.length} · slices: ${plan.slices.length}${plan.slicesApprovedAt ? " (approved)" : ""}`,
    ...(reports.length ? [`New slice reports: ${reports.map((p) => `${p.id} ${p.sliceId} ${p.status}${p.deviations.length ? ` (${p.deviations.length} deviation${p.deviations.length > 1 ? "s" : ""})` : ""}`).join("; ")}`] : []),
  ].join("\n");
}

const open = defineSurfaceTool({
  name: "surface_plan_open",
  label: "Plan open",
  opens: true,
  description:
    "Open a large-change plan on its page, or start one. Plans live outside the checkout (under the surface.plans.root setting, default ~/Work, then the repo's name) and outlast Pi sessions. " +
    "Pass slug to open an existing plan, or title (and optionally slug and destination) to start a new one. Without either, the error lists the repo's plans.",
  promptSnippet: "surface_plan_open: open or start a multi-session plan for a large change (map of decisions, architecture, slices)",
  parameters: Type.Object({
    worktree: Type.String({ description: "Absolute path of the checkout the plan is about." }),
    slug: Type.Optional(Type.String({ description: "The plan's directory name, e.g. usage-metering-v2." })),
    title: Type.Optional(Type.String({ description: "A new plan's title; its slug is derived from it unless slug is given." })),
    destination: Type.Optional(Type.String({ description: "A new plan's destination: what done looks like for the whole effort." })),
  }),
  async run(session: PlanSession, params) {
    const opened = await session.open(params);
    await session.flush();
    const lines = [
      `${opened.created ? "Started" : "Opened"} plan ${opened.ref.slug} on the page: ${opened.url}`,
      `Files: ${opened.ref.dir}`,
      opened.readOnly ? `Read-only: session ${session.state.lockHolder} is editing it. The user can take it over on the page.` : "",
      summary(opened.plan),
      "",
      opened.created ? "Next: frame it per the skill. Name the destination and out of scope with the user, then chart the map with surface_plan_map." : "Next: pick up from the frontier, and read any new slice reports first.",
    ];
    return { text: lines.filter(Boolean).join("\n"), details: { url: opened.url, dir: opened.ref.dir, created: opened.created } };
  },
});

const map = defineSurfaceTool({
  name: "surface_plan_map",
  label: "Plan map",
  description:
    "Change the plan's map: title, destination, out of scope, other repos, fog (decisions you can see coming but cannot phrase yet), and nodes. " +
    "Nodes are questions, never build steps. Omit a node's id to create it (ids are assigned N1..); pass an existing id to revise it. fromFog graduates a fog item into the node.",
  parameters: Type.Object({
    title: Type.Optional(Type.String()),
    destination: Type.Optional(Type.String({ description: "What done looks like for the whole plan." })),
    outOfScope: Type.Optional(Type.Array(Type.String(), { description: "Replaces the out-of-scope list." })),
    repos: Type.Optional(Type.Array(Type.String(), { description: "Other repositories the plan touches." })),
    fog: Type.Optional(Type.Object({ add: Type.Optional(Type.Array(Type.String())), remove: Type.Optional(Type.Array(Type.String({ description: "Fog id, e.g. F2." }))) })),
    nodes: Type.Optional(
      Type.Array(
        Type.Object({
          id: Type.Optional(Type.String({ description: "An existing node to revise; omit to create." })),
          type: NodeType,
          title: Type.String({ description: "The question, phrased so it can be answered." }),
          summary: Type.Optional(Type.String({ description: "Why it matters and what is known, two or three sentences." })),
          mode: Type.Optional(Mode),
          blockedBy: Type.Optional(Type.Array(Type.String(), { description: "Node ids that must be decided first." })),
          fromFog: Type.Optional(Type.String({ description: "The fog id this node graduates." })),
          checklist: Type.Optional(Type.Array(Type.String(), { description: "task nodes: the steps." })),
        }),
      ),
    ),
    removeNodes: Type.Optional(Type.Array(Type.String())),
  }),
  async run(session: PlanSession, params) {
    const created = session.map(params);
    await session.flush();
    return { text: `Map updated${created.length ? `; created ${created.join(", ")}` : ""}.\n${summary(session.state.plan!)}`, details: { created } };
  },
});

const ask = defineSurfaceTool({
  name: "surface_plan_ask",
  label: "Plan ask",
  description:
    "Put options on a discuss or spike node for the user to decide on the page; replaces earlier options. Every option needs pros, cons, a visual for every lens (kind na with a reason when it has nothing) and a 1-5 score on every dimension. " +
    "The turn ends after it; the decision arrives as a 'Surface · plan · decided' message.",
  parameters: Type.Object({
    nodeId: Type.String(),
    lenses: Type.Array(Lens, { description: "1-4 views that make the choice clear: archDiff for structure, matrix for spike results, stateMachine for behavior, wireframe for UI, view only when nothing else fits." }),
    dimensions: Type.Array(Dimension, { description: "What this decision trades between; at most 6." }),
    options: Type.Array(Type.Object({ id: Type.String(), label: Type.String(), recommended: Type.Optional(Type.Boolean()), ...OptionFields })),
  }),
  async run(session: PlanSession, params) {
    session.ask(params.nodeId, { lenses: params.lenses, dimensions: params.dimensions, options: params.options });
    await session.flush();
    return { text: `Posted ${params.options.length} options on ${params.nodeId}. End your turn; the decision arrives as a message.`, details: { nodeId: params.nodeId }, terminate: true };
  },
});

const node = defineSurfaceTool({
  name: "surface_plan_node",
  label: "Plan node",
  description: "Reply in a node's thread, add visuals, report an AFK run's progress, or publish a research or spike result on a node.",
  parameters: Type.Object({
    nodeId: Type.String(),
    text: Type.Optional(Type.String({ description: "A reply in the node's thread. Markdown, short." })),
    visuals: Type.Optional(Type.Array(LabeledVisual)),
    run: Type.Optional(
      Type.Object({
        status: Type.Union([Type.Literal("running"), Type.Literal("done"), Type.Literal("failed")]),
        note: Type.Optional(Type.String()),
        runIds: Type.Optional(Type.Array(Type.String(), { description: "Subagent run ids, so corrections can resume them." })),
        worktrees: Type.Optional(Type.Array(Type.String(), { description: "Spike worktree paths." })),
      }),
    ),
    result: Type.Optional(Type.Object({ markdown: Type.String({ description: "The findings, with citations or measurements." }), visuals: Type.Optional(Type.Array(LabeledVisual)) })),
  }),
  async run(session: PlanSession, params) {
    session.node(params.nodeId, params);
    await session.flush();
    return { text: `Updated ${params.nodeId}.`, details: { nodeId: params.nodeId } };
  },
});

const architecture = defineSurfaceTool({
  name: "surface_plan_architecture",
  label: "Plan architecture",
  description: "Publish the current and target architecture as component graphs, the ids whose role changes, and what each decision changes. Replaces the previous one.",
  parameters: Type.Object({
    summary: Type.String({ description: "Two to four sentences: how the system works now and what the target changes." }),
    current: Graph,
    target: Graph,
    changed: Type.Optional(Type.Array(Type.String(), { description: "Ids present in both whose role or contract changes." })),
    changes: Type.Array(
      Type.Object({
        component: Type.String(),
        kind: Type.Union([Type.Literal("add"), Type.Literal("remove"), Type.Literal("change")]),
        decisions: Type.Array(Type.String(), { description: "Node ids that drive it." }),
        note: Type.String(),
      }),
    ),
  }),
  async run(session: PlanSession, params) {
    session.architecture({ ...params, changed: params.changed ?? [] });
    await session.flush();
    return { text: "Published the architecture.", details: {} };
  },
});

const slices = defineSurfaceTool({
  name: "surface_plan_slices",
  label: "Plan slices",
  description:
    "Propose or revise the whole slice graph; replaces the previous slices and clears their approval. Each slice is one unit of delivery a person or agent builds and a team reviews on its own. Keep a slice's id to revise it. The user approves them on the page.",
  parameters: Type.Object({
    slices: Type.Array(
      Type.Object({
        id: Type.Optional(Type.String({ description: "An existing slice to keep; omit for new ones (S1..)." })),
        title: Type.String(),
        deliverable: Type.String({ description: "What exists when it is done, in one or two sentences." }),
        acceptance: Type.Array(Type.String(), { minItems: 1, description: "Checks a reviewer can verify." }),
        touches: Type.Array(Type.String(), { description: "Modules or paths it changes." }),
        dependsOn: Type.Array(Type.String(), { description: "Slice ids that must land first." }),
        size: Type.Union([Type.Literal("S"), Type.Literal("M"), Type.Literal("L"), Type.Literal("XL")]),
        mode: Mode,
        decisions: Type.Array(Type.String(), { description: "Decided node ids it relies on." }),
        brief: Type.String({ description: "The brief someone builds it from: context, approach, risks, what not to do. Markdown." }),
        status: Type.Optional(Type.Union(["proposed", "ready", "in-progress", "done", "blocked"].map((s) => Type.Literal(s)))),
        forgeSpec: Type.Optional(Type.String({ description: "Path of the forge spec designed for it." })),
      }),
    ),
  }),
  async run(session: PlanSession, params) {
    session.slices(params.slices);
    await session.flush();
    return { text: `Proposed ${params.slices.length} slices. End your turn; the user reviews and approves them on the page.`, details: { count: params.slices.length }, terminate: true };
  },
});

const artifact = defineSurfaceTool({
  name: "surface_plan_artifact",
  label: "Plan artifact",
  description: "Publish an RFC, architecture doc or decision log for the plan; the session writes it to the plan's artifacts directory. final true asks the user to approve it on the page.",
  parameters: Type.Object({
    kind: Type.Union([Type.Literal("rfc"), Type.Literal("architecture"), Type.Literal("decisionLog")]),
    markdown: Type.String(),
    final: Type.Optional(Type.Boolean()),
  }),
  async run(session: PlanSession, params) {
    const path = await session.artifact(params.kind, params.markdown, params.final ?? false);
    await session.flush();
    const name = ARTIFACT_NAMES[params.kind];
    return { text: `Saved the ${name} to ${path}${params.final ? "; the user reviews it on the page. End your turn." : "."}`, details: { kind: params.kind, path }, terminate: params.final ?? false };
  },
});

const report = defineSurfaceTool({
  name: "surface_plan_slice_report",
  label: "Plan slice report",
  always: true,
  description:
    "Report progress on a slice of a large-change plan from any session: started, done or blocked, and any assumption in its brief that turned out wrong. " +
    "Call it when you begin or finish work from a plan's slice brief (slices/S<n>.md under the plan's directory).",
  promptSnippet: "surface_plan_slice_report: report status and deviations on a slice of a surface-plan-large-change plan",
  parameters: Type.Object({
    worktree: Type.String({ description: "Absolute path of the checkout you are working in." }),
    plan: Type.String({ description: "The plan's slug, from its slice brief." }),
    sliceId: Type.String({ description: "e.g. S3" }),
    status: Type.Union([Type.Literal("in-progress"), Type.Literal("done"), Type.Literal("blocked")]),
    note: Type.String({ description: "One or two sentences: what landed, or what blocks it." }),
    deviations: Type.Optional(Type.Array(Type.Object({ text: Type.String({ description: "What was assumed, and what turned out true." }), nodes: Type.Optional(Type.Array(Type.String({ description: "Plan node ids it touches." }))) }))),
  }),
  async run(session: PlanSession, params) {
    const { dir, ingested } = await session.report(params);
    return { text: `Reported ${params.sliceId} ${params.status} to ${dir}${ingested ? " and updated the open plan page" : "; the planning session takes it in when it next opens or refreshes"}.`, details: { dir } };
  },
});

export default defineWorkflow<PlanState, PlanAction, PlanSession>({
  id: "plan",
  title: "plan",
  emptyState,
  parseAction,
  persistence: "own",
  tools: [open, map, ask, node, architecture, slices, artifact, ...opinionTools<PlanSession>("plan"), ...docTools<PlanSession>("plan"), report],
  create: (ctx) => new PlanSession(ctx),
});
