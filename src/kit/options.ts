import type { Visual, VisualKind } from "./code.ts";

/** One view every option of a question fills, so options compare side by side. */
export interface Lens {
  id: string;
  label: string;
  kind: Exclude<VisualKind, "na">;
}

export interface Dimension {
  id: string;
  label: string;
  hint?: string;
}

/** An axis the whole spec moves along; each session names its own from the problem it solves. */
export interface SpecDimension extends Dimension {
  /** cost (the default): a positive delta adds work or risk. benefit: a positive delta is a gain. */
  direction?: "cost" | "benefit";
}

export interface Score {
  value: number;
  why: string;
}

export interface ImpactItem {
  kind: "add" | "change" | "new" | "warn";
  text: string;
}

export interface Option {
  id: string;
  label: string;
  description: string;
  pros: string[];
  cons: string[];
  recommended?: boolean;
  visuals: Record<string, Visual>;
  scores: Record<string, Score>;
  impact?: ImpactItem[];
  specDelta?: Record<string, number>;
}

const MAX_OPTIONS = 4;
const MAX_LENSES = 4;
const MAX_DIMENSIONS = 6;
// Long option text is where unclear writing hides; a rejected round makes the agent rewrite it.
const MAX_DESCRIPTION = 280;
const MAX_POINT = 100;

/** The lenses, trade-off dimensions and options one decision compares. */
export interface OptionSet {
  lenses: Lens[];
  dimensions: Dimension[];
  options: Option[];
}

/**
 * Returns every problem with a decision's options, or none. Every option must
 * carry every lens and every dimension so options stay comparable.
 */
export function validateOptionSet(question: OptionSet): string[] {
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
function optionErrors(question: OptionSet, option: Option): string[] {
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
function lensErrors(question: OptionSet, option: Option): string[] {
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
function scoreErrors(question: OptionSet, option: Option): string[] {
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

