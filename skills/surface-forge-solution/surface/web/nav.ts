import { setHashValues } from "../../../../web/kit/hooks/useHashState.ts";

export type View = "q" | "o";
export const VIEWS: readonly View[] = ["q", "o"];

export function openQuestion(id: string): void {
  setHashValues({ view: "q", question: id });
}

/** The rendered element holding a heading's title or a TBD's text, found by text since the rich document has no anchor ids. */
function findByText(text: string, heading: boolean): HTMLElement | undefined {
  const needle = text.trim();
  const candidates = document.querySelectorAll<HTMLElement>(heading ? ".milkdown h1, .milkdown h2, .milkdown h3, .milkdown h4" : ".milkdown p, .milkdown li, .milkdown td");
  return [...candidates].find((el) => (heading ? el.textContent?.trim() === needle : Boolean(needle) && Boolean(el.textContent?.includes("TBD")) && Boolean(el.textContent?.includes(needle))));
}

/** Scrolls to a heading or TBD marker in a draft and flashes it so the eye finds it. */
export function scrollToMark(id: string, text = ""): void {
  const target = document.getElementById(id) ?? findByText(text, !id.includes("-tbd-"));
  if (!target) {
    return;
  }
  target.scrollIntoView({ behavior: "smooth", block: id.includes("-tbd-") ? "center" : "start" });
  target.animate([{ boxShadow: "0 0 0 3px var(--amber)" }, { boxShadow: "0 0 0 3px transparent" }], { duration: 1400, easing: "ease-out" });
}
