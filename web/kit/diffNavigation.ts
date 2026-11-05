import type { FileDiffMetadata } from "@pierre/diffs";
import type { JumpTarget } from "./hooks/useJumpTo.ts";

export interface HunkStop extends JumpTarget {
  oldLine: number;
  newLine: number;
}

/** Stops on the first changed line, not the context preceding a hunk. */
export function hunkStops(paths: readonly string[], patches: ReadonlyMap<string, FileDiffMetadata>): HunkStop[] {
  return paths.flatMap((path) => (patches.get(path)?.hunks ?? []).flatMap((hunk) => {
    let context = 0;
    for (const content of hunk.hunkContent) {
      if (content.type === "context") {
        context += content.lines;
      } else {
        const newLine = Math.max(1, hunk.additionStart + context);
        const oldLine = Math.max(1, hunk.deletionStart + context);
        const side = content.additions ? "RIGHT" : "LEFT";
        return [{ path, side, line: side === "RIGHT" ? newLine : oldLine, oldLine, newLine }];
      }
    }
    return [];
  }));
}

/** Crosses files in the visible order and clamps at either end, without wrapping. */
export function nextHunk(stops: readonly HunkStop[], paths: readonly string[], current: JumpTarget | undefined, delta: 1 | -1): HunkStop | undefined {
  if (!current) {
    return delta === 1 ? stops[0] : stops.at(-1);
  }
  const fileIndex = paths.indexOf(current.path);
  const ordered = delta === 1 ? stops : [...stops].reverse();
  return ordered.find((stop) => {
    const offset = paths.indexOf(stop.path) - fileIndex;
    const line = current.side === "LEFT" ? stop.oldLine : stop.newLine;
    return offset * delta > 0 || (offset === 0 && (line - current.line) * delta > 0);
  });
}
