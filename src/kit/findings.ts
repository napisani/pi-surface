import type { CodeRef, LabeledVisual } from "./code.ts";
import type { PrFile } from "./git.ts";
import type { Level } from "./levels.ts";
import type { Dimension, Score } from "./options.ts";
import type { ThreadMessage } from "./thread.ts";

export type Severity = "Critical" | "High" | "Medium" | "Low";
export const SEVERITIES: readonly Severity[] = ["Critical", "High", "Medium", "Low"];

/** What to do about a finding in this diff, from the most to the least urgent. */
export type TriageBucket = "fix-now" | "fix-now-expands" | "defer" | "skip";
export const TRIAGE_BUCKETS: readonly TriageBucket[] = ["fix-now", "fix-now-expands", "defer", "skip"];
export const BUCKET_LABEL = {
  "fix-now": "Fix now",
  "fix-now-expands": "Fix now · expands scope",
  defer: "Defer · file a follow-up",
  skip: "Skip",
} satisfies Record<TriageBucket, string>;

export type FixSize = "Trivial" | "Small" | "Moderate" | "Large";
export const FIX_SIZES: readonly FixSize[] = ["Trivial", "Small", "Moderate", "Large"];

export interface Triage {
  bucket: TriageBucket;
  fixSize: FixSize;
  /** Repository-relative files the fix edits; any outside the diff make it expand scope. */
  touches: string[];
  /** One sentence: why it landed in this bucket. */
  reason: string;
}

/**
 * The axes every finding is scored on, the same for all so findings overlay on
 * one radar. Further out is a stronger case for fixing it in this diff.
 */
export const FINDING_DIMENSIONS: readonly Dimension[] = [
  { id: "impact", label: "Impact", hint: "How bad it is when it happens" },
  { id: "likelihood", label: "Likelihood", hint: "How readily real input reaches it" },
  { id: "confidence", label: "Confidence", hint: "How sure the review is that it holds" },
  { id: "ease", label: "Fix ease", hint: "5 is one line; 1 is a refactor" },
  { id: "containment", label: "Containment", hint: "5 stays in files the diff touches" },
  { id: "safety", label: "Fix safety", hint: "How unlikely the fix is to break something else" },
  { id: "verifiable", label: "Verifiable", hint: "How directly a test can prove the fix" },
];

/** The fix's files that the diff does not touch; a rename's old path counts as touched. */
export function outsideFiles(files: readonly PrFile[], touches: readonly string[]): string[] {
  const inDiff = new Set(files.flatMap((f) => (f.previousPath ? [f.path, f.previousPath] : [f.path])));
  return touches.filter((path) => !inDiff.has(path));
}

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
  /** Absent only on findings published before triage existed. */
  triage?: Triage;
  /** One score per FINDING_DIMENSIONS id; absent only on findings published before scoring existed. */
  scores?: Record<string, Score>;
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
