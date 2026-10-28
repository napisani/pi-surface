import { createContext, useContext } from "react";
import type { JumpTarget } from "../../../../web/kit/hooks/useJumpTo.ts";

export interface ReviewNav {
  /** Opens the Files tab at a line, clearing filters that would hide its file. */
  jumpTo(target: JumpTarget): void;
  openFinding(id: string): void;
}

export const NavContext = createContext<ReviewNav | null>(null);

export function useNav(): ReviewNav {
  const nav = useContext(NavContext);
  if (!nav) {
    throw new Error("this component needs the review page's NavContext");
  }
  return nav;
}
