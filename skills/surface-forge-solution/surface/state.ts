import type { PatchOp } from "../../../src/host/patch.ts";
import { add, append, at, child, replace } from "../../../src/host/ptr.ts";
import { SurfaceError } from "../../../src/host/workflow.ts";
import type { Dimension, Lens, Option, SpecDimension } from "../../../src/kit/options.ts";
import type { ThreadMessage as KitMessage } from "../../../src/kit/thread.ts";

export interface ThreadMessage extends KitMessage {
  optionId?: string;
}

export type QuestionStatus = "open" | "answered" | "deferred";

export interface QuestionInput {
  id: string;
  header: string;
  title: string;
  prerequisites?: string[];
  lenses: Lens[];
  dimensions: Dimension[];
  options: Option[];
}

export interface Question extends QuestionInput {
  round: number;
  status: QuestionStatus;
  thread: ThreadMessage[];
}

export interface Decision {
  id: string;
  optionId: string | null;
  label: string;
  overrodeRecommendation: boolean;
  note?: string;
  status: "decided" | "reopened" | "deferred";
  round: number;
  at: string;
}

export type DraftKind = "spec" | "rfc";
export const DRAFT_NAMES = { spec: "tech spec", rfc: "RFC" } satisfies Record<DraftKind, string>;

export interface DraftReview {
  verdict: "approved" | "changes";
  note?: string;
  at: string;
}

export interface Draft {
  /** True from the user's request until the agent posts the draft. */
  writing: boolean;
  /** Empty until the agent first posts one. */
  markdown: string;
  /** The settled decisions the markdown was written from: id to option id, or null when deferred. */
  basis: Record<string, string | null>;
  at: string;
  /** Posted for the user's approval, not as an interim draft. */
  final: boolean;
  /** The file the agent wrote the draft to. */
  path?: string;
  /** The user's verdict on a final draft; cleared when the agent posts it again. */
  review?: DraftReview;
}

export interface ForgeState {
  version: 1;
  title: string;
  round: number;
  /** Whether the user wants an RFC written alongside the tech spec. */
  rfcRequested: boolean;
  /** The axes the Overview sums decided options' specDelta along, declared by the agent as rounds go. */
  specDimensions: SpecDimension[];
  questions: Question[];
  decisions: Decision[];
  drafts: Partial<Record<DraftKind, Draft>>;
}

// Sessions saved before each session declared its own spec dimensions used these ids undeclared.
const LEGACY_SPEC_DIMENSIONS: SpecDimension[] = [
  { id: "size", label: "Implementation size" },
  { id: "runtime", label: "Runtime cost" },
  { id: "ops", label: "Operational complexity" },
  { id: "platform", label: "Platform obligations" },
  { id: "security", label: "Secret exposure reduced", direction: "benefit" },
];

export function emptyState(title = "forge session"): ForgeState {
  return { version: 1, title, round: 0, rfcRequested: false, specDimensions: [], questions: [], decisions: [], drafts: {} };
}

/** The declared spec dimensions, plus any id an option's specDelta uses without declaring it (older sessions). */
export function specDimensionsOf(state: ForgeState): SpecDimension[] {
  const declared = new Set(state.specDimensions.map((d) => d.id));
  const used = new Set(state.questions.flatMap((q) => q.options.flatMap((o) => Object.keys(o.specDelta ?? {}))));
  const undeclared = [...used].filter((id) => !declared.has(id)).map((id) => LEGACY_SPEC_DIMENSIONS.find((d) => d.id === id) ?? { id, label: id });
  return [...state.specDimensions, ...undeclared];
}

/** The session's spec dimensions with a round's declarations merged in: a known id is updated in place, a new one appended. */
function mergeSpecDimensions(current: SpecDimension[], declared: SpecDimension[]): SpecDimension[] {
  const merged = current.map((d) => structuredClone(declared.find((x) => x.id === d.id) ?? d));
  return [...merged, ...declared.filter((d) => !current.some((c) => c.id === d.id)).map((d) => structuredClone(d))];
}

function specDimensionErrors(declared: SpecDimension[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const d of declared) {
    if (!d.id.trim()) {
      errors.push("a spec dimension needs an id");
    } else if (seen.has(d.id)) {
      errors.push(`spec dimension "${d.id}" is declared twice`);
    }
    seen.add(d.id);
    if (!d.label.trim()) {
      errors.push(`spec dimension "${d.id}" needs a label`);
    }
  }
  return errors;
}

/** Every specDelta key must name a spec dimension, so the Overview sums only axes the session declared. */
function specDeltaErrors(options: readonly Option[], dimensions: readonly SpecDimension[]): string[] {
  return options.flatMap((o) =>
    Object.keys(o.specDelta ?? {})
      .filter((key) => !dimensions.some((d) => d.id === key))
      .map((key) => `option "${o.id}" specDelta "${key}" names no spec dimension; declare it in specDimensions`),
  );
}

const s = at<ForgeState>();
const MAX_OPTIONS = 4;
const MAX_LENSES = 4;
const MAX_DIMENSIONS = 6;
// Long option text is where unclear writing hides; a rejected round makes the agent rewrite it.
const MAX_DESCRIPTION = 280;
const MAX_POINT = 100;

/**
 * Returns every problem with a question, or none. Every option must carry
 * every lens and every dimension so options stay comparable.
 */
export function validateQuestion(question: QuestionInput): string[] {
  const errors: string[] = [];
  const unique = (ids: string[], what: string) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) {
        errors.push(`duplicate ${what} id "${id}"`);
      }
      seen.add(id);
    }
  };
  if (question.options.length < 2 || question.options.length > MAX_OPTIONS) {
    errors.push(`a question needs 2-${MAX_OPTIONS} options, got ${question.options.length}`);
  }
  if (question.lenses.length < 1 || question.lenses.length > MAX_LENSES) {
    errors.push(`a question needs 1-${MAX_LENSES} lenses, got ${question.lenses.length}`);
  }
  if (question.dimensions.length > MAX_DIMENSIONS) {
    errors.push(`at most ${MAX_DIMENSIONS} trade-off dimensions, got ${question.dimensions.length}`);
  }
  unique(question.options.map((o) => o.id), "option");
  unique(question.lenses.map((l) => l.id), "lens");
  unique(question.dimensions.map((d) => d.id), "dimension");
  if (question.options.filter((o) => o.recommended).length > 1) {
    errors.push("at most one option may be recommended");
  }

  for (const option of question.options) {
    errors.push(...optionErrors(question, option));
  }
  return errors;
}

/** Every problem with one option: pros and cons, a visual per lens, a score per dimension. */
function optionErrors(question: QuestionInput, option: Option): string[] {
  const errors: string[] = [];
  if (!option.pros?.length) {
    errors.push(`option "${option.id}" needs at least one pro`);
  }
  if (!option.cons?.length) {
    errors.push(`option "${option.id}" needs at least one con`);
  }
  if ((option.description ?? "").length > MAX_DESCRIPTION) {
    errors.push(`option "${option.id}" description is ${option.description.length} characters; keep it to ${MAX_DESCRIPTION} (one or two plain sentences)`);
  }
  for (const point of [...(option.pros ?? []), ...(option.cons ?? [])]) {
    if (point.length > MAX_POINT) {
      errors.push(`option "${option.id}" pro/con "${point.slice(0, 40)}…" is ${point.length} characters; keep each to ${MAX_POINT}`);
    }
  }
  return [...errors, ...lensErrors(question, option), ...scoreErrors(question, option)];
}

/** A visual for every declared lens, of that lens's kind, and none for an undeclared lens. */
function lensErrors(question: QuestionInput, option: Option): string[] {
  const errors: string[] = [];
  for (const lens of question.lenses) {
    const visual = option.visuals[lens.id];
    if (!visual) {
      errors.push(`option "${option.id}" is missing lens "${lens.id}" (use kind "na" with a reason)`);
    } else if (visual.kind !== "na" && visual.kind !== lens.kind) {
      errors.push(`option "${option.id}" lens "${lens.id}" must be kind "${lens.kind}", got "${visual.kind}"`);
    }
  }
  for (const lensId of Object.keys(option.visuals)) {
    if (!question.lenses.some((l) => l.id === lensId)) {
      errors.push(`option "${option.id}" has undeclared lens "${lensId}"`);
    }
  }
  return errors;
}

/** A whole-number score from 1 to 5 on every trade-off dimension. */
function scoreErrors(question: QuestionInput, option: Option): string[] {
  const errors: string[] = [];
  for (const dimension of question.dimensions) {
    const score = option.scores[dimension.id];
    if (!score) {
      errors.push(`option "${option.id}" is missing a score for "${dimension.id}"`);
    } else if (!Number.isInteger(score.value) || score.value < 1 || score.value > 5) {
      errors.push(`option "${option.id}" score "${dimension.id}" must be an integer 1-5`);
    }
  }
  return errors;
}

function questionIndex(state: ForgeState, questionId: string): number {
  const index = state.questions.findIndex((q) => q.id === questionId);
  if (index < 0) {
    throw new SurfaceError(`unknown question "${questionId}"`);
  }
  return index;
}

/**
 * Ops that post questions together as the next round. Reusing a reopened
 * question's id replaces it in place; an answered question must be revisited
 * first. Throws listing every problem across the round.
 */
export function postRound(state: ForgeState, inputs: QuestionInput[], specDimensions: SpecDimension[] = []): PatchOp[] {
  if (inputs.length === 0) {
    throw new SurfaceError("a round needs at least one question");
  }
  const dimensions = mergeSpecDimensions(state.specDimensions, specDimensions);
  const errors: string[] = specDimensionErrors(specDimensions);
  const ids = new Set<string>();
  for (const input of inputs) {
    if (ids.has(input.id)) {
      errors.push(`question id "${input.id}" appears twice in the round`);
    }
    ids.add(input.id);
    if (state.questions.find((q) => q.id === input.id)?.status === "answered") {
      errors.push(`question "${input.id}" is already answered; it must be revisited first`);
    }
    errors.push(...[...validateQuestion(input), ...specDeltaErrors(input.options, dimensions)].map((e) => `${input.id}: ${e}`));
  }
  if (errors.length) {
    throw new SurfaceError(`invalid round:\n- ${errors.join("\n- ")}`);
  }

  const round = state.round + 1;
  const ops = [replace(s("round"), round)];
  if (specDimensions.length) {
    ops.push(replace(s("specDimensions"), dimensions));
  }
  for (const input of inputs) {
    const existing = state.questions.findIndex((q) => q.id === input.id);
    const thread = existing < 0 ? [] : state.questions[existing].thread;
    const question: Question = { ...structuredClone(input), round, status: "open", thread };
    ops.push(existing < 0 ? append(s("questions"), question) : replace(s("questions", existing), question));
  }
  return ops;
}

/** Open questions in a round, optionally ignoring one about to be closed. */
export function openInRound(state: ForgeState, round: number, exceptId?: string): Question[] {
  return state.questions.filter((q) => q.round === round && q.status === "open" && q.id !== exceptId);
}

export function recordAnswer(state: ForgeState, questionId: string, optionId: string, note: string | undefined, now: string): PatchOp[] {
  const qi = questionIndex(state, questionId);
  const question = state.questions[qi];
  if (question.status === "answered") {
    throw new SurfaceError(`question "${questionId}" is already answered`);
  }
  const option = question.options.find((o) => o.id === optionId);
  if (!option) {
    throw new SurfaceError(`question "${questionId}" has no option "${optionId}"`);
  }
  const recommended = question.options.find((o) => o.recommended);
  const decision: Decision = {
    id: questionId,
    optionId,
    label: option.label,
    overrodeRecommendation: recommended !== undefined && recommended.id !== optionId,
    status: "decided",
    round: question.round,
    at: now,
  };
  if (note) {
    decision.note = note;
  }
  return [replace(s("questions", qi, "status"), "answered"), ...putDecision(state, decision)];
}

export function deferQuestion(state: ForgeState, questionId: string, now: string): PatchOp[] {
  const qi = questionIndex(state, questionId);
  const question = state.questions[qi];
  if (question.status !== "open") {
    throw new SurfaceError(`question "${questionId}" is not open`);
  }
  const decision: Decision = { id: questionId, optionId: null, label: "Deferred", overrodeRecommendation: false, status: "deferred", round: question.round, at: now };
  return [replace(s("questions", qi, "status"), "deferred"), ...putDecision(state, decision)];
}

export function reopenDecision(state: ForgeState, decisionId: string): PatchOp[] {
  const di = state.decisions.findIndex((d) => d.id === decisionId);
  if (di < 0) {
    throw new SurfaceError(`unknown decision "${decisionId}"`);
  }
  if (state.decisions[di].status === "reopened") {
    throw new SurfaceError(`decision "${decisionId}" is already reopened`);
  }
  return [replace(s("decisions", di, "status"), "reopened"), replace(s("questions", questionIndex(state, decisionId), "status"), "open")];
}

export function addThreadMessage(state: ForgeState, questionId: string, message: ThreadMessage): PatchOp[] {
  const qi = questionIndex(state, questionId);
  const optionId = message.optionId;
  if (optionId !== undefined && !state.questions[qi].options.some((o) => o.id === optionId)) {
    throw new SurfaceError(`question "${questionId}" has no option "${optionId}"`);
  }
  return [append(s("questions", qi, "thread"), message)];
}

export type OptionRevision = Partial<Pick<Option, "description" | "pros" | "cons" | "visuals" | "scores" | "impact" | "specDelta">>;
const REVISABLE = ["description", "pros", "cons", "visuals", "scores", "impact", "specDelta"] as const;

/**
 * Ops that let a follow-up reply correct an option. Throws if the revised
 * question would no longer validate.
 */
export function reviseOption(state: ForgeState, questionId: string, optionId: string, revision: OptionRevision): PatchOp[] {
  const qi = questionIndex(state, questionId);
  const question = state.questions[qi];
  const oi = question.options.findIndex((o) => o.id === optionId);
  if (oi < 0) {
    throw new SurfaceError(`question "${questionId}" has no option "${optionId}"`);
  }
  const revised: Option = { ...question.options[oi], ...structuredClone(revision) };
  const errors = [...validateQuestion({ ...question, options: question.options.map((o, i) => (i === oi ? revised : o)) }), ...specDeltaErrors([revised], specDimensionsOf(state))];
  if (errors.length) {
    throw new SurfaceError(`invalid revision:\n- ${errors.join("\n- ")}`);
  }
  const option = s("questions", qi, "options", oi);
  const ops: PatchOp[] = [];
  for (const field of REVISABLE) {
    const value = revised[field];
    if (!(field in revision) || value === undefined) {
      continue;
    }
    ops.push(field in question.options[oi] ? replace(child(option, field), value) : add(child(option, field), value));
  }
  return ops;
}

/** Ops that record or withdraw the RFC request; none when it is unchanged. */
export function setRfcRequested(state: ForgeState, requested: boolean): PatchOp[] {
  return state.rfcRequested === requested ? [] : [replace(s("rfcRequested"), requested)];
}

/** Settled decisions keyed by id; a draft records this to show when it went stale. */
export function decisionBasis(state: ForgeState): Record<string, string | null> {
  return Object.fromEntries(state.decisions.filter((d) => d.status !== "reopened").map((d) => [d.id, d.optionId]));
}

/** Ops that mark a draft as being written, keeping any previous markdown on show. */
export function requestDraft(state: ForgeState, kind: DraftKind, now: string): PatchOp[] {
  const previous = state.drafts[kind];
  return [add(s("drafts", kind), { ...(previous ?? { markdown: "", basis: {}, at: now, final: false }), writing: true })];
}

export function postDraft(state: ForgeState, kind: DraftKind, markdown: string, now: string, options: { final?: boolean; path?: string } = {}): PatchOp[] {
  if (!markdown.trim()) {
    throw new SurfaceError("a draft needs markdown");
  }
  const draft: Draft = { writing: false, markdown, basis: decisionBasis(state), at: now, final: options.final ?? false };
  if (options.path) {
    draft.path = options.path;
  }
  return [add(s("drafts", kind), draft)];
}

/** The final drafts still waiting for the user's approval. */
export function awaitingApproval(state: ForgeState): DraftKind[] {
  const wanted: DraftKind[] = state.rfcRequested ? ["spec", "rfc"] : ["spec"];
  return wanted.filter((kind) => state.drafts[kind]?.review?.verdict !== "approved");
}

export type Verdict = "approve" | "approveWithRfc" | "changes";

/** Ops that record the user's verdict on a final draft. */
export function reviewDraft(state: ForgeState, kind: DraftKind, verdict: Verdict, note: string | undefined, now: string): PatchOp[] {
  const draft = state.drafts[kind];
  if (!draft?.final || draft.writing) {
    throw new SurfaceError(`no ${DRAFT_NAMES[kind]} is waiting for review`);
  }
  if (draft.review) {
    throw new SurfaceError(`the ${DRAFT_NAMES[kind]} was already ${draft.review.verdict === "approved" ? "approved" : "sent back"}; wait for the agent to post it again`);
  }
  if (verdict === "changes" && !note?.trim()) {
    throw new SurfaceError("say what to change");
  }
  if (verdict === "approveWithRfc" && (kind !== "spec" || state.rfcRequested)) {
    throw new SurfaceError("an RFC can be added only when approving the tech spec, before one was requested");
  }
  const review: DraftReview = { verdict: verdict === "changes" ? "changes" : "approved", at: now };
  if (note?.trim()) {
    review.note = note.trim();
  }
  return [add(s("drafts", kind, "review"), review), ...(verdict === "approveWithRfc" ? setRfcRequested(state, true) : [])];
}

function putDecision(state: ForgeState, decision: Decision): PatchOp[] {
  const di = state.decisions.findIndex((d) => d.id === decision.id);
  return [di < 0 ? append(s("decisions"), decision) : replace(s("decisions", di), decision)];
}
