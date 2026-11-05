import { useContext, useEffect, useId, useSyncExternalStore, type RefObject } from "react";
import { ScopeContext, useKeyboard } from "../keyboardContext.ts";

const subscribeNothing = () => () => undefined;

/** Marks an existing pane for directional focus and returns whether it owns local commands. */
export function useKeyboardPane(ref: RefObject<HTMLElement | null>, label: string): boolean {
  const keyboard = useKeyboard();
  const scope = useContext(ScopeContext);
  const id = useId();
  const pane = useSyncExternalStore(keyboard?.subscribe ?? subscribeNothing, () => keyboard?.get().pane ?? "");
  useEffect(() => {
    const element = ref.current;
    if (!element || !keyboard || !scope.active) {
      return;
    }
    element.dataset.keyboardPane = id;
    element.dataset.paneLabel = label;
    element.tabIndex = -1;
    const focus = () => keyboard.focusPane(id);
    element.addEventListener("pointerdown", focus);
    element.addEventListener("focusin", focus);
    const current = [...document.querySelectorAll<HTMLElement>("[data-keyboard-pane]")].find((node) => node.dataset.keyboardPane === keyboard.get().pane);
    if (!current || current.closest("[hidden]")) {
      focus();
    }
    return () => {
      delete element.dataset.keyboardPane;
      delete element.dataset.paneLabel;
      element.removeEventListener("pointerdown", focus);
      element.removeEventListener("focusin", focus);
    };
  }, [keyboard, scope.active, ref, id, label]);
  return pane === id && scope.active;
}
