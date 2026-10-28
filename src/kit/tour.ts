import type { CodeRef, LabeledVisual } from "./code.ts";

export interface TourStepInput {
  title: string;
  body: string;
  ref: CodeRef;
  visual?: LabeledVisual;
}

export interface TourStep extends TourStepInput {
  id: string;
}
