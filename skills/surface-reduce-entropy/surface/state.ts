import type { PatchOp } from "../../../src/host/patch.ts";
import { add, append, at, child, remove, replace } from "../../../src/host/ptr.ts";
import { SurfaceError } from "../../../src/host/workflow.ts";
import { validateVisual, type LabeledVisual } from "../../../src/kit/code.ts";
import type { Dimension, Score } from "../../../src/kit/options.ts";
import type { ThreadMessage } from "../../../src/kit/thread.ts";

/** What accepting a finding gives up, by who would notice; findings are asked smallest first. */
export type Concession = "none" | "internal" | "edge" | "feature";
export const CONCESSIONS: readonly Concession[] = ["none", "internal", "edge", "feature"];
export const CONCESSION_LABEL = { none: "No concession", internal: "Internal", edge: "Edge cases", feature: "Feature" } satisfies Record<Concession, string>;
export const CONCESSION_HINT = {
  none: "Nobody notices; behavior is identical.",
  internal: "Maintainers and internal callers notice; users do not.",
  edge: "Users notice in rare cases.",
  feature: "Users notice routinely.",
} satisfies Record<Concession, string>;

/**
 * The axes accepting a finding is scored on, the same for every finding so
 * findings overlay on one radar. 5 is the better outcome on every axis.
 */
export const ENTROPY_DIMENSIONS: readonly Dimension[] = [
  { id: "code", label: "Code removed", hint: "5 removes most of the scope; 1 a few lines" },
  { id: "concepts", label: "Concepts removed", hint: "5 removes a layer or dependency; 1 nothing named" },
  { id: "behavior", label: "Behavior kept", hint: "5 changes nothing a caller sees" },
  { id: "reversible", label: "Easy to reverse", hint: "5 is a revert; 1 loses data or a public contract" },
  { id: "safety", label: "Change safety", hint: "5 is covered by tests; 1 can break callers silently" },
];

/** Declining keeps the code as it is: nothing removed, nothing given up, nothing to undo. */
export const KEEP_SCORES = {
  code: { value: 1, why: "Nothing removed" },
  concepts: { value: 1, why: "Nothing removed" },
  behavior: { value: 5, why: "Nothing changes" },
  reversible: { value: 5, why: "Nothing to undo" },
  safety: { value: 5, why: "Nothing to break" },
} satisfies Record<string, Score>;

/** Scores in ENTROPY_DIMENSIONS order, as a radar draws them. */
export const radarValues = (scores: Readonly<Record<string, Score>>) => ENTROPY_DIMENSIONS.map((d) => scores[d.id]?.value ?? 0);

const MAX_TEXT = 280;
const MAX_POINT = 100;

export interface FindingInput {
  id: string;
  title: string;
  concession: Concession;
  /** What accepting gives up and who notices; "Nothing" for no concession. */
  givesUp: string;
  /** What the code becomes. */
  simplification: string;
  recommended: "accept" | "decline";
  /** Net lines removed when accepted. */
  lines: number;
  /** The types, files, options, layers or dependencies that disappear. */
  concepts: string[];
  pros: string[];
  cons: string[];
  /** The first is the before/after diff. */
  visuals: LabeledVisual[];
  /** One score per ENTROPY_DIMENSIONS id, for accepting. */
  scores: Record<string, Score>;
  /** Findings this one is written against, as their answers leave the code. */
  after?: string[];
}

export type FindingStatus = "open" | "accepted" | "declined";

export interface Finding extends FindingInput {
  batch: number;
  status: FindingStatus;
  note?: string;
  thread: ThreadMessage[];
}

export interface EntropyState {
  version: 1;
  scope: string;
  batch: number;
  findings: Finding[];
  /** True once the user sent the current decisions; any later change clears it. */
  submitted: boolean;
}

export function emptyState(): EntropyState {
  return { version: 1, scope: "", batch: 0, findings: [], submitted: false };
}

const s = at<EntropyState>();

/** Decisions changed after a send must be sent again. */
const unsend = (state: EntropyState): PatchOp[] => (state.submitted ? [replace(s("submitted"), false)] : []);

/** Returns every problem with a finding, or none. */
export function validateFinding(f: FindingInput): string[] {
  const errors: string[] = [];
  for (const [field, text] of [["title", f.title], ["givesUp", f.givesUp], ["simplification", f.simplification]] as const) {
    if (!text.trim()) {
      errors.push(`${field} is empty`);
    } else if (text.length > MAX_TEXT) {
      errors.push(`${field} is ${text.length} characters; keep it to ${MAX_TEXT} (one or two plain sentences)`);
    }
  }
  if (!f.pros.length || !f.cons.length) {
    errors.push("a finding needs at least one pro and one con");
  }
  for (const point of [...f.pros, ...f.cons]) {
    if (point.length > MAX_POINT) {
      errors.push(`pro/con "${point.slice(0, 40)}…" is ${point.length} characters; keep each to ${MAX_POINT}`);
    }
  }
  if (f.visuals[0]?.kind !== "diff") {
    errors.push("the first visual must be the before/after diff");
  }
  f.visuals.forEach((v, i) => errors.push(...validateVisual(v, `visual ${i + 1}`, { label: true })));
  for (const d of ENTROPY_DIMENSIONS) {
    const value = f.scores[d.id]?.value;
    if (value === undefined) {
      errors.push(`missing a score for "${d.id}"`);
    } else if (!Number.isInteger(value) || value < 1 || value > 5) {
      errors.push(`score "${d.id}" must be an integer 1-5`);
    }
  }
  if (f.concession === "none" && f.scores.behavior && f.scores.behavior.value !== 5) {
    errors.push(`a finding with no concession keeps all behavior; score "behavior" 5`);
  }
  return errors;
}

function findingIndex(state: EntropyState, id: string): number {
  const index = state.findings.findIndex((f) => f.id === id);
  if (index < 0) {
    throw new SurfaceError(`unknown finding "${id}"`);
  }
  return index;
}

/**
 * Ops that post findings as the next batch. Reusing an open finding's id
 * replaces it in place; a decided one must be reopened first. Throws listing
 * every problem across the batch.
 */
export function postFindings(state: EntropyState, scope: string | undefined, inputs: FindingInput[]): PatchOp[] {
  if (inputs.length === 0) {
    throw new SurfaceError("post at least one finding");
  }
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const input of inputs) {
    if (ids.has(input.id)) {
      errors.push(`finding id "${input.id}" appears twice`);
    }
    ids.add(input.id);
    const existing = state.findings.find((f) => f.id === input.id);
    if (existing && existing.status !== "open") {
      errors.push(`finding "${input.id}" is already ${existing.status}; the user must reopen it first`);
    }
    for (const dep of input.after ?? []) {
      if (!ids.has(dep) && !state.findings.some((f) => f.id === dep)) {
        errors.push(`${input.id}: "after" names unknown finding "${dep}"`);
      }
    }
    errors.push(...validateFinding(input).map((e) => `${input.id}: ${e}`));
  }
  if (!state.scope && !scope?.trim()) {
    errors.push("the first batch needs a scope");
  }
  if (errors.length) {
    throw new SurfaceError(`invalid findings:\n- ${errors.join("\n- ")}`);
  }

  const batch = state.batch + 1;
  const ops = [replace(s("batch"), batch), ...unsend(state)];
  if (scope?.trim()) {
    ops.push(replace(s("scope"), scope.trim()));
  }
  for (const input of inputs) {
    const index = state.findings.findIndex((f) => f.id === input.id);
    const finding: Finding = { ...structuredClone(input), batch, status: "open", thread: index < 0 ? [] : state.findings[index].thread };
    ops.push(index < 0 ? append(s("findings"), finding) : replace(s("findings", index), finding));
  }
  return ops;
}

export function decide(state: EntropyState, id: string, verdict: "accept" | "decline", note: string | undefined): PatchOp[] {
  const index = findingIndex(state, id);
  if (state.findings[index].status !== "open") {
    throw new SurfaceError(`finding "${id}" is already ${state.findings[index].status}`);
  }
  const ops = [replace(s("findings", index, "status"), verdict === "accept" ? "accepted" : "declined"), ...unsend(state)];
  if (note) {
    ops.push(add(s("findings", index, "note"), note));
  }
  return ops;
}

export function reopen(state: EntropyState, id: string): PatchOp[] {
  const index = findingIndex(state, id);
  const finding = state.findings[index];
  if (finding.status === "open") {
    throw new SurfaceError(`finding "${id}" is already open`);
  }
  const ops = [replace(s("findings", index, "status"), "open"), ...unsend(state)];
  if (finding.note !== undefined) {
    ops.push(remove(s("findings", index, "note")));
  }
  return ops;
}

/** Ops that mark the decisions as sent; every finding must be decided first. */
export function submit(state: EntropyState): PatchOp[] {
  const open = state.findings.filter((f) => f.status === "open");
  if (state.findings.length === 0) {
    throw new SurfaceError("there are no findings to send");
  }
  if (open.length) {
    throw new SurfaceError(`decide ${open.map((f) => f.id).join(", ")} first`);
  }
  if (state.submitted) {
    throw new SurfaceError("these decisions were already sent");
  }
  return [replace(s("submitted"), true)];
}

export function addThreadMessage(state: EntropyState, id: string, message: ThreadMessage): PatchOp[] {
  return [append(s("findings", findingIndex(state, id), "thread"), message)];
}

export type FindingRevision = Partial<Pick<FindingInput, "title" | "givesUp" | "simplification" | "recommended" | "lines" | "concepts" | "pros" | "cons" | "visuals" | "scores">>;
const REVISABLE = ["title", "givesUp", "simplification", "recommended", "lines", "concepts", "pros", "cons", "visuals", "scores"] as const;

/** Ops that let a follow-up reply correct a finding. Throws if the revised finding would no longer validate. */
export function reviseFinding(state: EntropyState, id: string, revision: FindingRevision): PatchOp[] {
  const index = findingIndex(state, id);
  const revised: Finding = { ...state.findings[index], ...structuredClone(revision) };
  const errors = validateFinding(revised);
  if (errors.length) {
    throw new SurfaceError(`invalid revision:\n- ${errors.join("\n- ")}`);
  }
  const at = s("findings", index);
  return REVISABLE.filter((field) => field in revision && revision[field] !== undefined).map((field) => replace(child(at, field), revised[field]));
}

/** Ordered for review: by batch, then by concession size, smallest first; within a size, as posted. */
export function ordered(findings: readonly Finding[]): Finding[] {
  return findings.toSorted((a, b) => a.batch - b.batch || CONCESSIONS.indexOf(a.concession) - CONCESSIONS.indexOf(b.concession));
}

export interface NetEffect {
  accepted: number;
  lines: number;
  concepts: number;
  givenUp: Record<Concession, number>;
}

/** What the accepted findings add up to. */
export function netEffect(findings: readonly Finding[]): NetEffect {
  const accepted = findings.filter((f) => f.status === "accepted");
  const givenUp = { none: 0, internal: 0, edge: 0, feature: 0 } satisfies Record<Concession, number>;
  for (const f of accepted) {
    givenUp[f.concession] += 1;
  }
  return { accepted: accepted.length, lines: accepted.reduce((n, f) => n + f.lines, 0), concepts: accepted.reduce((n, f) => n + f.concepts.length, 0), givenUp };
}
