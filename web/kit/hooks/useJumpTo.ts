import type { CodeViewHandle } from "@pierre/diffs/react";
import { useCallback, type RefObject } from "react";
import type { Side } from "../../../src/kit/code.ts";
import { annotationSide, diffItemId } from "../diffItems.ts";

export interface JumpTarget {
  path: string;
  side: Side;
  line: number;
  startLine?: number;
}

/** Scrolls a CodeView to a line and selects it. */
export function useJumpTo<A>(ref: RefObject<CodeViewHandle<A, undefined> | null>): (target: JumpTarget) => void {
  return useCallback(
    (target: JumpTarget) => {
      // The first frame commits the tab switch and item changes; CodeView measures them on the next.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const viewer = ref.current;
          if (!viewer) {
            return;
          }
          const id = diffItemId(target.path);
          const side = annotationSide(target.side);
          const start = target.startLine ?? target.line;
          viewer.scrollTo({ type: "line", id, lineNumber: start, side, align: "center" });
          viewer.setSelectedLines({ id, range: { start, end: target.line, side } });
        }),
      );
    },
    [ref],
  );
}
