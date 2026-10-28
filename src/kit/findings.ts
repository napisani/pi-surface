import type { CodeRef, LabeledVisual } from "./code.ts";
import type { Level } from "./levels.ts";
import type { ThreadMessage } from "./thread.ts";

export type Severity = "Critical" | "High" | "Medium" | "Low";
export const SEVERITIES: readonly Severity[] = ["Critical", "High", "Medium", "Low"];

export interface FindingInput {
  title: string;
  severity: Severity;
  confidence: Level;
  confidenceReason?: string;
  category: string;
  summary: string;
  fix?: string;
  evidence?: string;
  verified?: string;
  primary: CodeRef;
  related?: CodeRef[];
  visuals?: LabeledVisual[];
}

export interface Finding extends Omit<FindingInput, "related" | "visuals"> {
  id: string;
  related: CodeRef[];
  visuals: LabeledVisual[];
  dismissed: boolean;
  thread: ThreadMessage[];
}

export interface DroppedFinding {
  severity: string;
  title: string;
  lens: string;
  reason: string;
}

export interface ReviewSummary {
  intent: string;
  risk: Level;
  scope: string;
}
