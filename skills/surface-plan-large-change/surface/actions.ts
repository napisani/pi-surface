import { join } from "node:path";
import { Type, type Static, type TProperties } from "typebox";
import { decodeAction, inArea, trimmed, type Json } from "../../../src/host/decode.ts";
import type { PatchOp } from "../../../src/host/patch.ts";
import { SurfaceError } from "../../../src/host/workflow.ts";
import type { OpinionTarget, TargetInfo } from "../../../src/kit/opinion.ts";
import { DOC_ACTIONS, isDocAction, resolveDocAction, type DocScope } from "../../../src/kit/docActions.ts";
import { isOpinionAction, OPINION_ACTIONS, resolveOpinionAction, type OpinionScope } from "../../../src/kit/opinionActions.ts";
import {
  acknowledgeReport,
  allDocComments,
  planDoc,
  approveSlices,
  ARTIFACT_NAMES,
  askAbout,
  checkStep,
  decide,
  defer,
  dependents,
  editScope,
  frontier,
  nodeOf,
  isArtifactKind,
  opinionsPtr,
  reopen,
  requestArtifact,
  requestWork,
  reviewArtifact,
  setReviewer,
  setSliceStatus,
  writable,
  type Plan,
  type PlanRef,
  type PlanState,
} from "./state.ts";

const MAX_TEXT = 20_000;
const Id = Type.String({ minLength: 1, maxLength: 200 });
const Text = Type.String({ minLength: 1, maxLength: MAX_TEXT });
const OptionalText = Type.Optional(Type.String({ maxLength: MAX_TEXT }));
const Kind = Type.Enum(["rfc", "architecture", "decisionLog"]);
const action = <T extends string, P extends TProperties>(type: T, properties: P) => Type.Object({ type: Type.Literal(type), ...properties });

const ACTIONS = {
  "scope.edit": action("scope.edit", {
    destination: OptionalText,
    addOutOfScope: OptionalText,
    removeOutOfScope: Type.Optional(Type.Integer({ minimum: 0 })),
    addFog: OptionalText,
    removeFog: Type.Optional(Id),
  }),
  "node.decide": action("node.decide", { nodeId: Id, optionId: Type.Optional(Id), text: OptionalText, note: OptionalText }),
  "node.defer": action("node.defer", { nodeId: Id }),
  "node.reopen": action("node.reopen", { nodeId: Id }),
  "node.ask": action("node.ask", { nodeId: Id, text: Text }),
  "node.work": action("node.work", { nodeId: Id, kind: Type.Enum(["options", "deeper", "research", "spike", "propose"]), focus: OptionalText }),
  "node.check": action("node.check", { nodeId: Id, index: Type.Integer({ minimum: 0 }), done: Type.Boolean() }),
  "fog.clarify": action("fog.clarify", { fogId: Id }),
  "map.next": action("map.next", { focus: OptionalText }),
  "arch.request": action("arch.request", { focus: OptionalText }),
  "slices.request": action("slices.request", { focus: OptionalText }),
  "slices.approve": action("slices.approve", {}),
  "slice.status": action("slice.status", { sliceId: Id, status: Type.Enum(["proposed", "ready", "in-progress", "done", "blocked"]) }),
  "slice.forge": action("slice.forge", { sliceId: Id }),
  "report.ack": action("report.ack", { reportId: Id }),
  "artifact.request": action("artifact.request", { kind: Kind }),
  "artifact.review": action("artifact.review", { kind: Kind, verdict: Type.Enum(["approve", "changes"]), note: OptionalText }),
  "reviewer.set": action("reviewer.set", {
    model: Type.Optional(Type.String({ maxLength: 200 })),
    savePrompt: Type.Optional(Type.Object({ name: Id, text: Text })),
    removePrompt: Type.Optional(Id),
  }),
  "lock.takeOver": action("lock.takeOver", {}),
  refresh: action("refresh", {}),
  ...OPINION_ACTIONS,
  ...DOC_ACTIONS,
};

export type PlanAction = Static<(typeof ACTIONS)[keyof typeof ACTIONS]>;

export function parseAction(body: Json): PlanAction {
  const a = decodeAction(ACTIONS, body);
  if (a.type === "node.decide" || a.type === "artifact.review") {
    const note = trimmed(a.note);
    if (note === undefined) {
      delete a.note;
    } else {
      a.note = note;
    }
  }
  if ("focus" in a) {
    const focus = trimmed(a.focus);
    if (focus === undefined) {
      delete a.focus;
    } else {
      a.focus = focus;
    }
  }
  return a;
}

/** Work the session does after committing an action's ops. */
export type Effect = { kind: "takeOver" } | { kind: "refresh" };

export interface Resolution {
  ops: PatchOp[];
  message?: string;
  effect?: Effect;
  /** The user edited a document's text. */
  edited?: { kind: string; id: string; label: string; before: string; after: string };
}

export const planLine = (plan: Plan, ref: PlanRef) => `Plan: "${plan.title}" (${plan.slug}) · files ${ref.dir} · worktree ${ref.worktree}`;

const nodeLine = (plan: Plan, id: string) => {
  const n = nodeOf(plan, id);
  return `${n.id} [${n.type} · ${n.mode}] ${n.title}`;
};

function opinionScope(state: PlanState, ref: PlanRef): OpinionScope<PlanState> {
  const plan = writable(state);
  const targets = new Map<string, (id: string) => TargetInfo>([
    [
      "node",
      (id) => {
        const n = nodeOf(plan, id);
        const authors = n.run?.runIds.length ? ` Its findings came from subagent run(s) ${n.run.runIds.join(", ")}; resume them with the accepted findings rather than rewriting from scratch.` : "";
        return {
          label: `${n.id} ${n.title}`,
          brief: {
            content: `${n.id} as written in ${join(ref.dir, "decisions", `${n.id}.md`)}: its question, options and any findings. The map for context: ${join(ref.dir, "map.md")}.`,
            revise: `republish its options with surface_plan_ask, or its findings with surface_plan_node result.${authors} Never change a decision the user made.`,
          },
        };
      },
    ],
    ["map", () => ({ label: "the map", brief: { content: `the destination, nodes, fog and scope in ${join(ref.dir, "map.md")}.`, revise: "change it with surface_plan_map." } })],
    ["architecture", () => ({ label: "the architecture", brief: { content: `${join(ref.dir, "architecture.md")} and the decisions in ${join(ref.dir, "decisions")}.`, revise: "republish it with surface_plan_architecture." } })],
    ["slices", () => ({ label: "the slice breakdown", brief: { content: `the slice briefs in ${join(ref.dir, "slices")} and the map in ${join(ref.dir, "map.md")}.`, revise: "republish the slices with surface_plan_slices." } })],
    [
      "artifact",
      (id) => {
        if (!isArtifactKind(id)) {
          throw new SurfaceError(`unknown artifact "${id}"`);
        }
        return { label: `the ${ARTIFACT_NAMES[id]}`, brief: { content: join(ref.dir, "artifacts", `${id}.md`), revise: `republish it with surface_plan_artifact kind "${id}".` } };
      },
    ],
  ]);
  const lookup = (kind: string, id: string) => {
    const make = targets.get(kind);
    if (!make) {
      throw new SurfaceError(`a second opinion cannot target "${kind}"`);
    }
    return make(id);
  };
  return {
    list: opinionsPtr,
    opinions: plan.opinions,
    target: (kind, id): OpinionTarget => ({ kind, id, label: lookup(kind, id).label }),
    brief: (t) => lookup(t.kind, t.id).brief,
    tools: { findings: "surface_plan_opinion", update: "surface_plan_opinion_update" },
  };
}

const WORK = {
  options: (line: string) => `Put options on ${line} with surface_plan_ask: 2-4 options, lenses that make the choice clear, and trade-off scores. End your turn after.`,
  deeper: (line: string) => `Go deeper on ${line}: find what the current options or findings miss, add visuals with surface_plan_node, and revise the options with surface_plan_ask if they change.`,
  research: (line: string) =>
    `Research ${line}: launch one async research subagent with a sharp brief (the question, what is already decided, what would change the answer, and the user's focus if given). Report it running with surface_plan_node run (runIds), keep working other nodes, and publish its cited findings with surface_plan_node result when it returns. Then propose the decision right away: post options with surface_plan_ask, the one the findings support recommended, each pro and con citing the finding behind it.`,
  propose: (line: string) =>
    `Propose the decision for ${line} from its findings: read them, then post 2-4 options with surface_plan_ask, the one the findings support recommended, each pro and con citing the finding behind it. If the findings leave a gap that matters, say so with surface_plan_node and suggest the follow-up research or spike instead of guessing.`,
  spike: (line: string) =>
    "Spike " +
    line +
    ": launch one async worker subagent per approach, each in its own git worktree named <repo>__worktrees/plan-<slug>-<node>-<approach>, building just enough to measure the difference. Report it running with surface_plan_node run (runIds and worktrees). When they return, publish a comparison (a matrix visual of call sites, blast radius, tests, numbers) with surface_plan_node result, then the options with surface_plan_ask for the user to decide. Never touch the user's checkout.",
};

function resolveNode(state: PlanState, a: Extract<PlanAction, { type: `node.${string}` }>, now: string, head: (title: string) => string): Resolution {
  const plan = writable(state);
  switch (a.type) {
    case "node.decide": {
      const ops = decide(state, a.nodeId, a, now);
      const unblocked = plan.nodes.filter((n) => n.status === "open" && n.blockedBy.includes(a.nodeId) && n.blockedBy.every((b) => b === a.nodeId || plan.nodes.find((x) => x.id === b)?.status === "decided"));
      const label = a.optionId ? (plan.nodes.find((n) => n.id === a.nodeId)?.choice?.options.find((o) => o.id === a.optionId)?.label ?? a.optionId) : (a.text ?? "Done");
      return {
        ops,
        message: [
          head(`decided ${a.nodeId}: ${label}`),
          nodeLine(plan, a.nodeId),
          ...(a.note ? [`The user's note: ${a.note}`] : []),
          ...(unblocked.length ? [`This unblocks ${unblocked.map((n) => n.id).join(", ")}.`] : []),
          "",
          "Update the map with surface_plan_map: graduate fog this decision clears into nodes, and add questions it makes askable. Then keep the frontier moving: start AFK research or spikes, and put options on the most leveraged HIL node.",
        ].join("\n"),
      };
    }
    case "node.defer":
      return { ops: defer(state, a.nodeId, now), message: `${head(`deferred ${a.nodeId}`)}\n${nodeLine(plan, a.nodeId)}\nLeave it; continue with the frontier.` };
    case "node.reopen": {
      const down = dependents(plan, a.nodeId);
      return {
        ops: reopen(state, a.nodeId, now),
        message: [
          head(`reopened ${a.nodeId}`),
          nodeLine(plan, a.nodeId),
          `Downstream: nodes ${down.nodes.join(", ") || "none"}; slices ${down.slices.join(", ") || "none"}.`,
          "Do not design around the old answer. Ask what changed, revise the node's options with surface_plan_ask, and flag the downstream nodes and slices it may invalidate in your reply with surface_plan_node.",
        ].join("\n"),
      };
    }
    case "node.ask": {
      const node = nodeOf(plan, a.nodeId);
      return {
        ops: askAbout(state, a.nodeId, a.text, now),
        message: [head(`question about ${a.nodeId}`), nodeLine(plan, a.nodeId), ...node.thread.map((m) => `${m.role === "user" ? "user" : "you"}: ${m.text}`), `Question: ${a.text}`, "", "Answer with surface_plan_node text (and visuals when structure explains it better)."].join("\n"),
      };
    }
    case "node.work":
      return { ops: requestWork(state, a.nodeId, a.kind, a.focus, now), message: [head(`${a.kind} ${a.nodeId}`), ...(a.focus ? [`Focus: ${a.focus}`] : []), WORK[a.kind](nodeLine(plan, a.nodeId))].join("\n") };
    case "node.check":
      return { ops: checkStep(state, a.nodeId, a.index, a.done, now) };
  }
}

function resolveSlices(state: PlanState, a: Extract<PlanAction, { type: `slice${string}` }>, now: string, head: (title: string) => string, ref: PlanRef): Resolution {
  const plan = writable(state);
  switch (a.type) {
    case "slices.request":
      return {
        ops: [],
        message: [
          head("break the plan into slices"),
          ...(a.focus ? [`Focus: ${a.focus}`] : []),
          `Open nodes left: ${frontier(plan).length}. Propose the slice graph per references/slices.md with surface_plan_slices: each slice small enough to build and review on its own, with acceptance criteria, what it touches, dependencies, and the decisions it relies on.`,
        ].join("\n"),
      };
    case "slices.approve":
      return { ops: approveSlices(state, now), message: `${head("slices approved")}\nThe slices are approved and marked ready. Point the user at the briefs in ${join(ref.dir, "slices")}; do not start building.` };
    case "slice.status":
      return { ops: setSliceStatus(state, a.sliceId, a.status, now) };
    case "slice.forge": {
      const slice = plan.slices.find((s) => s.id === a.sliceId);
      if (!slice) {
        throw new SurfaceError(`unknown slice "${a.sliceId}"`);
      }
      return {
        ops: [],
        message: [
          head(`design ${slice.id} in forge`),
          `Slice: ${slice.id} ${slice.title}. Brief: ${join(ref.dir, "slices", `${slice.id}.md`)}.`,
          `Start a forge session for it (the surface-forge-solution skill, surface_forge_ask). Treat the plan's decided nodes it relies on (${slice.decisions.join(", ") || "none"}) as locked constraints, not questions. When forge's spec is approved, record its path on the slice with surface_plan_slices (forgeSpec).`,
        ].join("\n"),
      };
    }
  }
}

function resolveRest(state: PlanState, a: Exclude<PlanAction, { type: `node.${string}` | `slice${string}` | `opinion.${string}` | `doc.${string}` }>, now: string, head: (title: string) => string, ref: PlanRef): Resolution {
  const plan = writable(state);
  switch (a.type) {
    case "scope.edit":
      return { ops: editScope(state, a, now) };
    case "fog.clarify": {
      const fog = plan.fog.find((f) => f.id === a.fogId);
      if (!fog) {
        throw new SurfaceError(`no fog item "${a.fogId}"`);
      }
      return { ops: [], message: `${head(`clarify fog ${fog.id}`)}\nFog: ${fog.text}\nIf the question can be stated precisely now, add it as a node with surface_plan_map (fromFog "${fog.id}"). If not, reply with surface_plan_map leaving it as fog and say what it waits on.` };
    }
    case "map.next":
      return {
        ops: [],
        message: [head("work the frontier"), ...(a.focus ? [`Focus: ${a.focus}`] : []), `Frontier: ${frontier(plan).map((n) => n.id).join(", ") || "empty"}.`, "Start AFK research and spikes on the frontier, then put options on the most leveraged HIL node with surface_plan_ask."].join("\n"),
      };
    case "arch.request":
      return { ops: [], message: [head("update the architecture"), ...(a.focus ? [`Focus: ${a.focus}`] : []), "Read the code and the decisions, then publish the current and target architecture with surface_plan_architecture, naming which decisions drive each change."].join("\n") };
    case "report.ack":
      return { ops: acknowledgeReport(state, a.reportId, now) };
    case "artifact.request":
      return {
        ops: requestArtifact(state, a.kind, now),
        message: `${head(`write the ${ARTIFACT_NAMES[a.kind]}`)}\nWrite it from the decided nodes, architecture and slices per references/artifacts.md, and publish it with surface_plan_artifact kind "${a.kind}" (final true when it is complete). The session saves it to ${join(ref.dir, "artifacts", `${a.kind}.md`)}.`,
      };
    case "artifact.review": {
      const verdict = a.verdict === "approve" ? "approved" : "changes";
      return {
        ops: reviewArtifact(state, a.kind, verdict, a.note, now),
        message: `${head(`${ARTIFACT_NAMES[a.kind]} ${verdict === "approved" ? "approved" : "needs changes"}`)}${a.note ? `\nThe user says: ${a.note}` : ""}${verdict === "changes" ? `\nRevise it and publish again with surface_plan_artifact kind "${a.kind}".` : ""}`,
      };
    }
    case "reviewer.set":
      return { ops: setReviewer(state, a, now) };
    case "lock.takeOver":
      return { ops: [], effect: { kind: "takeOver" } };
    case "refresh":
      return { ops: [], effect: { kind: "refresh" } };
  }
}

/** Turns one page action into ops, the message that wakes the agent when it has work, and any disk work for the session. */
export function resolveAction(state: PlanState, a: PlanAction, now: string): Resolution {
  if (a.type === "lock.takeOver" || a.type === "refresh") {
    return { ops: [], effect: { kind: a.type === "refresh" ? "refresh" : "takeOver" } };
  }
  const plan = writable(state);
  const ref = state.ref!;
  const head = (title: string) => `${title}\n${planLine(plan, ref)}`;
  if (isDocAction(a)) {
    const scope: DocScope<PlanState> = { doc: (kind, id) => planDoc(state, kind, id, ref.dir), allComments: () => allDocComments(plan), tool: "surface_plan_doc_comments" };
    const { ops, message, edited } = resolveDocAction(scope, a, now);
    return { ops, message: message ? message.replace("\n", `\n${planLine(plan, ref)}\n`) : undefined, edited: edited ? { kind: a.docKind, id: a.docId, ...edited } : undefined };
  }
  if (isOpinionAction(a)) {
    const { ops, message } = resolveOpinionAction(opinionScope(state, ref), a, now);
    return { ops, message: message ? message.replace("\n", `\n${planLine(plan, ref)}\n`) : undefined };
  }
  if (inArea(a, "node.")) {
    return resolveNode(state, a, now, head);
  }
  if (inArea(a, "slice")) {
    return resolveSlices(state, a, now, head, ref);
  }
  return resolveRest(state, a, now, head, ref);
}
