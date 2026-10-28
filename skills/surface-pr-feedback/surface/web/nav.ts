// Moving between the feedback page's tabs. Both targets live in the URL hash
// or a page store, so any component can call these without props.
import { setHashValues } from "../../../../web/kit/hooks/useHashState.ts";
import { createValueStore } from "../../../../web/kit/valueStore.ts";

/** The Changes tab's file filter, set from the Feedback tab when it jumps there. */
export const changesFilter = createValueStore("");

export function openItem(id: string): void {
  setHashValues({ tab: "feedback", item: id });
}

export function showChanges(path: string): void {
  changesFilter.set(path);
  setHashValues({ tab: "changes" });
}
