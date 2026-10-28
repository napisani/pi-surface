import { setHashValues } from "../../../../web/kit/hooks/useHashState.ts";

export type View = "q" | "o";
export const VIEWS: readonly View[] = ["q", "o"];

export function openQuestion(id: string): void {
  setHashValues({ view: "q", question: id });
}

/** Scrolls to a heading or TBD marker in a draft and flashes it so the eye finds it. */
export function scrollToMark(id: string): void {
  const target = document.getElementById(id);
  if (!target) {
    return;
  }
  target.scrollIntoView({ behavior: "smooth", block: id.includes("-tbd-") ? "center" : "start" });
  target.animate([{ boxShadow: "0 0 0 3px var(--amber)" }, { boxShadow: "0 0 0 3px transparent" }], { duration: 1400, easing: "ease-out" });
}
