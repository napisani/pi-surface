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
