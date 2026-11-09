import { setHashValues } from "../../../../web/kit/hooks/useHashState.ts";

export type View = "f" | "o";
export const VIEWS: readonly View[] = ["f", "o"];

export function openFinding(id: string): void {
  setHashValues({ view: "f", finding: id });
}
