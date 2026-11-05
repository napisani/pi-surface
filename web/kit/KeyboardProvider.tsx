import { useEffect, useState, type ReactNode } from "react";
import { decode, type Json } from "../../src/host/decode.ts";
import { DEFAULT_KEYBINDINGS, keybindingsResponseSchema, parseKeybindings, type KeybindingConfig } from "../../src/kit/keybindings.ts";
import { Keyboard } from "./keyboard.ts";
import { KeyboardContext } from "./keyboardContext.ts";
import { KeyboardOverlay } from "./KeyboardOverlay.tsx";
import { focusPane } from "./paneNavigation.ts";

function typing(event: KeyboardEvent): HTMLElement | undefined {
  return event.composedPath().find((node): node is HTMLElement => node instanceof HTMLElement && (node.isContentEditable || node.matches("input,textarea,select,[role=textbox]")));
}

function ignoreKey(event: KeyboardEvent): boolean {
  return event.defaultPrevented || ["Control", "Meta", "Alt", "Shift"].includes(event.key);
}

function eventKey(event: KeyboardEvent): string {
  const modifier = [event.ctrlKey ? "Ctrl" : "", event.altKey ? "Alt" : "", event.metaKey ? "Meta" : ""].filter(Boolean);
  if (event.shiftKey && (modifier.length || event.key.length > 1)) {
    modifier.push("Shift");
  }
  return [...modifier, event.key].join("+");
}

export function KeyboardProvider({ children, config, engine }: { children: ReactNode; config?: KeybindingConfig; engine?: Keyboard }) {
  const [keyboard] = useState(() => engine ?? new Keyboard());
  useEffect(() => {
    if (config) {
      keyboard.configure(config);
      return;
    }
    const controller = new AbortController();
    keyboard.configure(DEFAULT_KEYBINDINGS, "Loading configuration…");
    void fetch("keybindings", { signal: controller.signal }).then(async (response) => {
      if (!response.ok) {
        throw new Error(`Cannot load keybindings (${response.status})`);
      }
      const json: Json = await response.json();
      const body = decode(keybindingsResponseSchema, json, "keyboard configuration");
      if ("error" in body) {
        throw new Error(body.error);
      }
      if (!controller.signal.aborted) {
        keyboard.configure(parseKeybindings(body.config));
      }
    }).catch((error) => {
      if (!controller.signal.aborted) {
        keyboard.configure(DEFAULT_KEYBINDINGS, error instanceof Error ? error.message : String(error));
      }
    });
    return () => controller.abort();
  }, [keyboard, config]);
  useEffect(() => {
    const unregister = keyboard.register("app", 0, [
      { id: "surface.commands", label: "Find a command", keys: ["<leader>fk", "<leader>fm", "?"], run: () => keyboard.searchCommands() },
      { id: "surface.pane.left", label: "Focus left pane", keys: ["gwh"], run: () => focusPane("left", keyboard.get().pane) },
      { id: "surface.pane.down", label: "Focus lower pane", keys: ["gwj"], run: () => focusPane("down", keyboard.get().pane) },
      { id: "surface.pane.up", label: "Focus upper pane", keys: ["gwk"], run: () => focusPane("up", keyboard.get().pane) },
      { id: "surface.pane.right", label: "Focus right pane", keys: ["gwl"], run: () => focusPane("right", keyboard.get().pane) },
    ]);
    const reset = () => { keyboard.cancel(); keyboard.closePicker(); };
    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229) {
        keyboard.cancel();
        return;
      }
      if (ignoreKey(event)) {
        return;
      }
      if (keyboard.get().picker) {
        if (event.key === "Escape") {
          event.preventDefault();
          keyboard.closePicker();
        } else if (!event.ctrlKey && !event.altKey && !event.metaKey && ["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) {
          event.preventDefault();
          if (event.key === "Enter") {
            if (!event.repeat) { keyboard.choose(); }
          } else {
            keyboard.moveChoice(event.key === "ArrowDown" ? 1 : -1);
          }
        }
        return;
      }
      const input = typing(event);
      if (input) {
        keyboard.cancel();
        if (event.key === "Escape") {
          event.preventDefault();
          input.blur();
        }
        return;
      }
      if (event.composedPath().some((node) => node instanceof HTMLElement && node.matches('[role="dialog"],dialog[open]'))) {
        keyboard.cancel();
        return;
      }
      if (event.key === "Escape") {
        if (keyboard.get().prefix.length) {
          event.preventDefault();
          keyboard.cancel();
        }
        return;
      }
      if (event.repeat) {
        return;
      }
      if (keyboard.press(eventKey(event))) {
        event.preventDefault();
      }
    };
    const onFocus = (event: FocusEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest("[data-keyboard-overlay]")) {
        keyboard.cancel();
      }
    };
    const onVisibility = () => { if (document.hidden) { reset(); } };
    document.addEventListener("keydown", onKey);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", reset);
    window.addEventListener("hashchange", reset);
    return () => {
      unregister();
      reset();
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", reset);
      window.removeEventListener("hashchange", reset);
    };
  }, [keyboard]);
  return <KeyboardContext value={keyboard}>{children}<KeyboardOverlay keyboard={keyboard} /></KeyboardContext>;
}
