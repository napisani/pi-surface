import { SurfaceError } from "../host/workflow.ts";

/**
 * Which version of a file to read: the merge base, the head under review, the
 * commit a changes view compares against, or the working tree on disk.
 */
export type Rev = "base" | "head" | "since" | "work";
export const REVS: readonly Rev[] = ["base", "head", "since", "work"];

/** GitHub's names for the two sides of a diff; used only where GitHub requires them. */
export type Side = "LEFT" | "RIGHT";

/** A line or line range a GitHub comment or change request attaches to. */
export interface Anchor {
  path: string;
  side: Side;
  line: number;
  startLine?: number;
}

/** A stretch of code at one revision; may be outside the diff's files. */
export interface CodeRef {
  path: string;
  rev: Rev;
  startLine: number;
  endLine: number;
  note?: string;
}

/** The diff side a revision's lines sit on. */
export const sideOf = (rev: Rev): Side => (rev === "base" ? "LEFT" : "RIGHT");

/** The diff line range a code ref covers: its side, last line, and first line when it spans several. */
export function anchorOf(ref: CodeRef): Anchor {
  const anchor: Anchor = { path: ref.path, side: sideOf(ref.rev), line: ref.endLine };
  if (ref.startLine < ref.endLine) {
    anchor.startLine = ref.startLine;
  }
  return anchor;
}

export interface DataTable {
  caption?: string;
  headers: string[];
  rows: string[][];
  highlight?: Record<string, "good" | "bad">;
}

interface VisualCommon {
  look?: string;
  stat?: string;
}

export type Visual =
  | (VisualCommon & { kind: "callTree"; text: string })
  | (VisualCommon & { kind: "diff"; unified: string })
  | (VisualCommon & { kind: "code"; lang?: string; text: string })
  | (VisualCommon & { kind: "mermaid"; source: string })
  | (VisualCommon & { kind: "data"; tables: DataTable[]; code?: { lang?: string; text: string } })
  | (VisualCommon & { kind: "query"; lang?: string; command: string; result: DataTable })
  | (VisualCommon & { kind: "na"; reason: string });

export type VisualKind = Visual["kind"];

/** A visual shown in a list of tabs, so it needs a tab label. */
export type LabeledVisual = Visual & { label: string };

/** What a visual of its kind lacks, or undefined when it is complete. */
function missingPart(visual: Visual): string | undefined {
  switch (visual.kind) {
    case "mermaid":
      return visual.source?.trim() ? undefined : "mermaid visual needs a source";
    case "data":
      return visual.tables?.length ? undefined : "data visual needs at least one table";
    case "query":
      return visual.command?.trim() ? undefined : "query visual needs a command";
    case "callTree":
    case "code":
      return visual.text?.trim() ? undefined : `${visual.kind} visual needs text`;
    case "diff":
      return visual.unified?.trim() ? undefined : "diff visual needs unified text";
    case "na":
      return visual.reason?.trim() ? undefined : "na visual needs a reason";
    default: {
      // Tool input that slipped past its schema can still carry a kind no case names.
      const other: { kind: string } = visual;
      return `unknown visual kind "${other.kind}"`;
    }
  }
}

/** Returns every problem with a visual, or none. */
export function validateVisual(visual: Visual, what: string, options: { label?: boolean } = {}): string[] {
  const errors: string[] = [];
  const label = "label" in visual ? String(visual.label ?? "") : "";
  if (options.label && !label.trim()) {
    errors.push(`${what}: a visual needs a label`);
  }
  const missing = missingPart(visual);
  if (missing) {
    errors.push(`${what}: ${missing}`);
  }
  return errors;
}

// No absolute paths, no leading dash (git would read an option), no . or .. segments.
const SAFE_PATH = /^(?!\/)(?!-)(?!.*(^|\/)\.\.?(\/|$))[^\0:]+$/;

export function checkPath(path: string, what: string): void {
  if (!SAFE_PATH.test(path)) {
    throw new SurfaceError(`${what}: "${path}" is not a repository-relative path`);
  }
}

export function checkLines(start: number, end: number, what: string): void {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
    throw new SurfaceError(`${what}: lines must be integers with 1 <= start <= end, got ${start}-${end}`);
  }
}

/** Checks a code ref's path and lines, and that its revision is one this workflow can read. */
export function checkRef(ref: CodeRef, what: string, revs: readonly Rev[] = REVS): void {
  checkPath(ref.path, what);
  if (!revs.includes(ref.rev)) {
    throw new SurfaceError(`${what}: rev must be one of ${revs.join(", ")}, got "${ref.rev}"`);
  }
  checkLines(ref.startLine, ref.endLine, what);
}

export function checkSide(side: Side, what: string): void {
  if (side !== "LEFT" && side !== "RIGHT") {
    throw new SurfaceError(`${what}: side must be LEFT or RIGHT`);
  }
}
