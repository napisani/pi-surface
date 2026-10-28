import type { CodeRef } from "../../src/kit/code.ts";

/** A line or range as people read it, e.g. 3 or 3–7. */
export const lines = (start: number, end: number) => (end > start ? `${start}–${end}` : String(start));

/** Where a code ref points, marking code that only exists before the change. */
export const refLabel = (ref: CodeRef) => `${ref.path}:${lines(ref.startLine, ref.endLine)}${ref.rev === "base" ? " (before)" : ""}`;
