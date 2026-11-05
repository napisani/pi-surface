// A second opinion: another model reviews something the agent wrote, the user
// triages each finding, accepted ones go back to the original author for
// corrections, and the page shows what changed. Every workflow keeps its own
// list of opinions; these helpers work on whichever list they are pointed at.
import type { Created, PatchOp } from "../host/patch.ts";
import { add, append, child, item, remove, replace, type Ptr } from "../host/ptr.ts";
import { SurfaceError } from "../host/workflow.ts";
import { SEVERITIES, type Severity } from "./findings.ts";
import type { ThreadMessage } from "./thread.ts";

export type Verdict = "pending" | "accept" | "reject" | "discuss";
export const VERDICTS: readonly Verdict[] = ["pending", "accept", "reject", "discuss"];

export interface OpinionFinding {
  id: string;
  severity: Severity;
  claim: string;
  evidence?: string;
  suggestion?: string;
  /** The review pass that raised it. */
  pass: number;
  verdict: Verdict;
  thread: ThreadMessage[];
  /** The author's answer once corrections ran. */
  outcome?: { status: "done" | "declined"; reply: string };
  /** The user's ruling on a declined finding: keep the author's version, or send it back. */
  ruling?: "author" | "reviewer";
}

/** What was reviewed, named by the workflow that owns it. */
export interface OpinionTarget {
  kind: string;
  id: string;
  label: string;
}

export interface ReviewerChoice {
  model: string;
  prompt: string;
  promptName?: string;
}

export type OpinionStatus = "reviewing" | "triage" | "correcting" | "revised" | "settled" | "failed";

export interface Opinion {
  id: string;
  target: OpinionTarget;
  reviewer: ReviewerChoice;
  pass: number;
  maxPasses: number;
  status: OpinionStatus;
  findings: OpinionFinding[];
  summary?: string;
  /** Why it failed, when it did. */
  note?: string;
  /** The reviewer subagent's run id, so a re-review resumes it. */
  runId?: string;
  /** The target's text before and after the last corrections. */
  before?: string;
  after?: string;
  requestedAt: string;
  updatedAt: string;
}

/** Defaults each workflow keeps so a second opinion is one click. */
export interface ReviewerDefaults {
  model: string | null;
  prompts: { name: string; text: string }[];
}

export const PRESET_PROMPTS: readonly { name: string; text: string }[] = [
  { name: "Skeptical staff engineer", text: "Challenge the reasoning. Find unstated assumptions, missing alternatives, and claims the evidence does not support. Say what would change the conclusion." },
  { name: "Failure modes and operations", text: "Look for what breaks in production: partial failure, retries, data migration, rollout and rollback, observability, and on-call burden." },
  { name: "Simplest thing that works", text: "Find complexity the goal does not need. Propose the smallest design that meets the stated destination, and name what it gives up." },
  { name: "Reviewability", text: "Judge whether each piece can be built and reviewed on its own: scope, dependencies, acceptance criteria, and whether a reviewer could verify it." },
];

export const MAX_PASSES = 3;

export interface FindingInput {
  severity: Severity;
  claim: string;
  evidence?: string;
  suggestion?: string;
}

export interface CorrectionInput {
  findingId: string;
  status: "done" | "declined";
  reply: string;
}

function indexOf(opinions: readonly Opinion[], id: string): number {
  const i = opinions.findIndex((o) => o.id === id);
  if (i < 0) {
    throw new SurfaceError(`unknown second opinion "${id}"`);
  }
  return i;
}

export function opinionOf(opinions: readonly Opinion[], id: string): Opinion {
  return opinions[indexOf(opinions, id)];
}

function findingIndex(opinion: Opinion, findingId: string): number {
  const i = opinion.findings.findIndex((f) => f.id === findingId);
  if (i < 0) {
    throw new SurfaceError(`${opinion.id} has no finding "${findingId}"`);
  }
  return i;
}

const nextId = (opinions: readonly Opinion[]) => `O${opinions.reduce((n, o) => Math.max(n, Number(o.id.slice(1)) || 0), 0) + 1}`;

/** Ops that open a second opinion; returns its id. */
export function requestOpinion<S>(list: Ptr<S, Opinion[]>, opinions: readonly Opinion[], target: OpinionTarget, reviewer: ReviewerChoice, maxPasses: number, now: string): Created {
  if (!reviewer.model.trim()) {
    throw new SurfaceError("pick a reviewer model");
  }
  if (!reviewer.prompt.trim()) {
    throw new SurfaceError("give the reviewer a prompt");
  }
  if (opinions.some((o) => o.target.kind === target.kind && o.target.id === target.id && (o.status === "reviewing" || o.status === "correcting"))) {
    throw new SurfaceError(`a second opinion on ${target.label} is already in progress`);
  }
  const id = nextId(opinions);
  const opinion: Opinion = {
    id,
    target: { ...target },
    reviewer: { ...reviewer },
    pass: 1,
    maxPasses: Math.min(Math.max(1, Math.round(maxPasses)), MAX_PASSES),
    status: "reviewing",
    findings: [],
    requestedAt: now,
    updatedAt: now,
  };
  return { id, ops: [append(list, opinion)] };
}

/** Ops that publish a review pass's findings, or its failure. */
export function postFindings<S>(list: Ptr<S, Opinion[]>, opinions: readonly Opinion[], id: string, input: { findings: FindingInput[]; summary?: string; runId?: string } | { failed: string }, now: string): PatchOp[] {
  const i = indexOf(opinions, id);
  const opinion = opinions[i];
  if (opinion.status !== "reviewing") {
    throw new SurfaceError(`${id} is ${opinion.status}, not waiting for a review`);
  }
  const p = item(list, i);
  if ("failed" in input) {
    return [replace(child(p, "status"), "failed"), add(child(p, "note"), input.failed), replace(child(p, "updatedAt"), now)];
  }
  const errors = input.findings.flatMap((f, n) => [
    ...(SEVERITIES.includes(f.severity) ? [] : [`finding ${n + 1}: severity must be one of ${SEVERITIES.join(", ")}`]),
    ...(f.claim?.trim() ? [] : [`finding ${n + 1}: needs a claim`]),
  ]);
  if (errors.length) {
    throw new SurfaceError(`invalid findings:\n- ${errors.join("\n- ")}`);
  }
  const first = opinion.findings.length;
  const findings: OpinionFinding[] = input.findings.map((f, n) => ({ ...structuredClone(f), id: `${id}.${first + n + 1}`, pass: opinion.pass, verdict: "pending", thread: [] }));
  const ops: PatchOp[] = [...findings.map((f) => append(child(p, "findings"), f)), replace(child(p, "status"), findings.length ? "triage" : "settled"), replace(child(p, "updatedAt"), now)];
  if (input.summary) {
    ops.push(add(child(p, "summary"), input.summary));
  }
  if (input.runId) {
    ops.push(add(child(p, "runId"), input.runId));
  }
  return ops;
}

export function setVerdict<S>(list: Ptr<S, Opinion[]>, opinions: readonly Opinion[], id: string, findingIds: readonly string[], verdict: Verdict, now: string): PatchOp[] {
  const i = indexOf(opinions, id);
  const opinion = opinions[i];
  if (opinion.status === "reviewing" || opinion.status === "correcting") {
    throw new SurfaceError(`${id} is ${opinion.status}; wait for the agent`);
  }
  const p = item(list, i);
  const ops = findingIds.map((fid) => {
    const fi = findingIndex(opinion, fid);
    if (opinion.findings[fi].outcome) {
      throw new SurfaceError(`${fid} was already corrected`);
    }
    return replace(child(item(child(p, "findings"), fi), "verdict"), verdict);
  });
  return [...ops, replace(child(p, "updatedAt"), now)];
}

/** Findings the author still owes an answer: accepted, or sent back after a decline. */
export const owed = (opinion: Opinion) => opinion.findings.filter((f) => f.verdict === "accept" && (!f.outcome || f.ruling === "reviewer"));

export interface SentCorrections {
  ops: PatchOp[];
  sent: OpinionFinding[];
}

/** Ops that send accepted findings back to the author; returns the findings sent. */
export function sendCorrections<S>(list: Ptr<S, Opinion[]>, opinions: readonly Opinion[], id: string, now: string): SentCorrections {
  const i = indexOf(opinions, id);
  const opinion = opinions[i];
  if (opinion.status !== "triage" && opinion.status !== "revised") {
    throw new SurfaceError(`${id} is ${opinion.status}; corrections go back after triage`);
  }
  if (opinion.findings.some((f) => f.verdict === "pending")) {
    throw new SurfaceError("triage every finding first");
  }
  const sent = owed(opinion);
  if (!sent.length) {
    throw new SurfaceError("no accepted findings to send");
  }
  const p = item(list, i);
  return { ops: [replace(child(p, "status"), "correcting"), replace(child(p, "updatedAt"), now)], sent };
}

/** Ops that record the author's answers and the target's text before and after. */
export function recordCorrections<S>(list: Ptr<S, Opinion[]>, opinions: readonly Opinion[], id: string, updates: readonly CorrectionInput[], texts: { before?: string; after?: string }, now: string): PatchOp[] {
  const i = indexOf(opinions, id);
  const opinion = opinions[i];
  if (opinion.status !== "correcting") {
    throw new SurfaceError(`${id} is ${opinion.status}, not waiting for corrections`);
  }
  const p = item(list, i);
  const ops: PatchOp[] = [];
  const answered = new Set<string>();
  for (const u of updates) {
    const fi = findingIndex(opinion, u.findingId);
    if (!u.reply?.trim()) {
      throw new SurfaceError(`${u.findingId}: needs a reply`);
    }
    const fp = item(child(p, "findings"), fi);
    ops.push(add(child(fp, "outcome"), { status: u.status, reply: u.reply.trim() }));
    if (opinion.findings[fi].ruling) {
      ops.push(remove(child(fp, "ruling")));
    }
    answered.add(u.findingId);
  }
  const missing = owed(opinion).filter((f) => !answered.has(f.id));
  if (missing.length) {
    throw new SurfaceError(`answer every finding sent back: ${missing.map((f) => f.id).join(", ")}`);
  }
  if (texts.before !== undefined) {
    ops.push(add(child(p, "before"), texts.before));
  }
  if (texts.after !== undefined) {
    ops.push(add(child(p, "after"), texts.after));
  }
  return [...ops, replace(child(p, "status"), "revised"), replace(child(p, "updatedAt"), now)];
}

/** Ops for the user's ruling on a declined finding. */
export function ruleOn<S>(list: Ptr<S, Opinion[]>, opinions: readonly Opinion[], id: string, findingId: string, side: "author" | "reviewer", now: string): PatchOp[] {
  const i = indexOf(opinions, id);
  const opinion = opinions[i];
  const fi = findingIndex(opinion, findingId);
  if (opinion.findings[fi].outcome?.status !== "declined") {
    throw new SurfaceError(`${findingId} was not declined`);
  }
  const p = item(list, i);
  return [add(child(item(child(p, "findings"), fi), "ruling"), side), replace(child(p, "updatedAt"), now)];
}

/** Ops that start the next review pass, which looks at the corrected target. */
export function reReview<S>(list: Ptr<S, Opinion[]>, opinions: readonly Opinion[], id: string, now: string): PatchOp[] {
  const i = indexOf(opinions, id);
  const opinion = opinions[i];
  if (opinion.status !== "revised" && opinion.status !== "triage") {
    throw new SurfaceError(`${id} is ${opinion.status}; re-review after corrections`);
  }
  if (opinion.pass >= opinion.maxPasses) {
    throw new SurfaceError(`${id} has used its ${opinion.maxPasses} passes`);
  }
  const p = item(list, i);
  return [replace(child(p, "pass"), opinion.pass + 1), replace(child(p, "status"), "reviewing"), replace(child(p, "updatedAt"), now)];
}

export function settle<S>(list: Ptr<S, Opinion[]>, opinions: readonly Opinion[], id: string, now: string): PatchOp[] {
  const p = item(list, indexOf(opinions, id));
  return [replace(child(p, "status"), "settled"), replace(child(p, "updatedAt"), now)];
}

export function addFindingMessage<S>(list: Ptr<S, Opinion[]>, opinions: readonly Opinion[], id: string, findingId: string, message: ThreadMessage): PatchOp[] {
  const i = indexOf(opinions, id);
  const fi = findingIndex(opinions[i], findingId);
  return [append(child(item(child(item(list, i), "findings"), fi), "thread"), message)];
}

/** How a workflow tells the agent where the target lives and how to revise it. */
export interface TargetBrief {
  /** What to hand the reviewer: where the content is, or the content itself. */
  content: string;
  /** How the author revises it, e.g. which tool republishes it. */
  revise: string;
}

/** A target's label with its brief, as a workflow looks one up. */
export interface TargetInfo {
  label: string;
  brief: TargetBrief;
}

const findingLine = (f: OpinionFinding) => `- ${f.id} [${f.severity}] ${f.claim}${f.suggestion ? ` · suggested: ${f.suggestion}` : ""}${f.evidence ? ` · evidence: ${f.evidence}` : ""}`;

/** The message that asks the agent to run a review pass. */
export function reviewMessage(opinion: Opinion, brief: TargetBrief, tool: string): string {
  const earlier = opinion.findings.length
    ? ["", "Earlier findings and what came of them (do not repeat these; check the corrections held):", ...opinion.findings.map((f) => `${findingLine(f)} · ${f.verdict}${f.outcome ? ` · ${f.outcome.status}: ${f.outcome.reply}` : ""}`)]
    : [];
  const resume = opinion.runId && opinion.pass > 1 ? ` Resume reviewer run ${opinion.runId} so it keeps its context.` : "";
  return [
    `second opinion ${opinion.id} on ${opinion.target.label} · pass ${opinion.pass} of ${opinion.maxPasses}`,
    `Reviewer model: ${opinion.reviewer.model}${opinion.reviewer.promptName ? ` · prompt: ${opinion.reviewer.promptName}` : ""}`,
    `Review prompt: ${opinion.reviewer.prompt}`,
    "",
    `What to review: ${brief.content}`,
    ...earlier,
    "",
    `Run the review as a read-only subagent on model ${opinion.reviewer.model} (pi-subagents, the reviewer agent with that model override).${resume} Give it the content and the review prompt, and ask for findings as JSON: severity (Critical, High, Medium, Low), claim, evidence, suggestion. It must not edit anything.`,
    `Publish its findings unchanged with ${tool} (opinionId "${opinion.id}", runId set to the reviewer run's id), or report failed with the reason. Do not act on the findings; the user triages them first.`,
  ].join("\n");
}

/** The message that sends accepted findings back to the author. */
export function correctionsMessage(opinion: Opinion, sent: readonly OpinionFinding[], brief: TargetBrief, tool: string): string {
  return [
    `second opinion ${opinion.id} · corrections to ${opinion.target.label}`,
    "The user accepted these findings from the reviewer:",
    ...sent.map((f) => `${findingLine(f)}${f.ruling === "reviewer" ? ` · you declined this before ("${f.outcome?.reply}"); the user sided with the reviewer` : ""}`),
    ...sent.flatMap((f) => f.thread.map((m) => `  ${f.id} ${m.role === "user" ? "user" : "you"}: ${m.text}`)),
    "",
    `You are the author. Revise ${opinion.target.label} for each finding: ${brief.revise}`,
    `Then call ${tool} once (opinionId "${opinion.id}") with done or declined plus a one-line reply per finding, and the target's text before and after your changes.`,
  ].join("\n");
}

/** The message for a question about one finding. */
export function findingQuestionMessage(opinion: Opinion, finding: OpinionFinding, text: string, tool: string): string {
  return [
    `second opinion ${opinion.id} · question about ${finding.id} on ${opinion.target.label}`,
    findingLine(finding),
    `Question: ${text}`,
    "",
    `Answer from the target and the code, in two to four sentences, with ${tool} (opinionId "${opinion.id}", replies with findingId "${finding.id}").`,
  ].join("\n");
}

export interface OpinionUpdate {
  updates?: CorrectionInput[];
  before?: string;
  after?: string;
  /** Answers to the user's questions about findings. */
  replies?: { findingId: string; text: string }[];
}

/** Ops for the agent's corrections and replies on one opinion. */
export function applyOpinionUpdate<S>(list: Ptr<S, Opinion[]>, opinions: readonly Opinion[], id: string, update: OpinionUpdate, now: string): PatchOp[] {
  const ops: PatchOp[] = [];
  for (const r of update.replies ?? []) {
    if (!r.text?.trim()) {
      throw new SurfaceError(`${r.findingId}: a reply needs text`);
    }
    ops.push(...addFindingMessage(list, opinions, id, r.findingId, { role: "agent", text: r.text.trim(), at: now }));
  }
  if (update.updates?.length) {
    ops.push(...recordCorrections(list, opinions, id, update.updates, { before: update.before, after: update.after }, now));
  }
  if (!ops.length) {
    throw new SurfaceError("give updates for the corrections, or replies to questions");
  }
  return ops;
}
