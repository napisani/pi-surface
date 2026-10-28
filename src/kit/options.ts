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
