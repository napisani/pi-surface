import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { displayKeys, type Keyboard } from "./keyboard.ts";
import css from "./KeyboardOverlay.module.css";

export function KeyboardOverlay({ keyboard }: { keyboard: Keyboard }) {
  const state = useSyncExternalStore(keyboard.subscribe, keyboard.get, keyboard.get);
  const input = useRef<HTMLInputElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const selected = useRef<HTMLButtonElement>(null);
  // Remembers the message, not a flag, so a different error shows again.
  const [dismissed, setDismissed] = useState("");
  const open = state.picker !== null;
  useEffect(() => {
    if (!open) {
      return;
    }
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const field = input.current;
    const previous = previousFocus.current;
    field?.focus();
    return () => {
      if (document.activeElement === field || !document.activeElement || document.activeElement === document.body) {
        previous?.focus();
      }
    };
  }, [open]);
  useEffect(() => {
    selected.current?.scrollIntoView({ block: "nearest" });
  }, [state.picker?.index, state.picker?.query]);
  const choices = keyboard.choices();
  return (
    <>
      {state.error && state.error !== dismissed ? (
        <div className={css.error} role="alert">
          <span>Keyboard disabled: {state.error}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setDismissed(state.error)}>
            ×
          </button>
        </div>
      ) : null}
      {state.prefix.length ? <div className={css.pending}>{displayKeys(state.prefix)} · Esc cancels</div> : null}
      {state.hints ? (
        <div className={css.hints} data-keyboard-overlay>
          <header>{displayKeys(state.prefix)}</header>
          <div className={css.keys}>
            {keyboard.continuations().map((entry) => (
              <button key={entry.key} type="button" title={entry.disabled} onClick={() => keyboard.press(entry.key)}>
                <kbd>{displayKeys([entry.key])}</kbd><span>{entry.label}{entry.disabled ? ` — ${entry.disabled}` : ""}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {state.picker ? (
        <div className={css.backdrop} data-keyboard-dialog onClick={(event) => { if (event.target === event.currentTarget) { keyboard.closePicker(); } }}>
          <div className={css.picker} role="dialog" aria-label={state.picker.title}>
            <header>{state.picker.title}<button type="button" onClick={() => keyboard.closePicker()}>Esc · Close</button></header>
            <input ref={input} aria-label="Fuzzy filter" placeholder="Type to filter…" value={state.picker.query} onChange={(event) => keyboard.filter(event.target.value)} />
            <div className={css.results}>
              {choices.length ? choices.map((choice, index) => (
                <button ref={index === state.picker?.index ? selected : undefined} key={choice.id} type="button" className={index === state.picker?.index ? css.selected : undefined} disabled={Boolean(choice.disabled)} onClick={() => keyboard.choose(index)}>
                  <span>{choice.label}</span><small>{choice.disabled ?? choice.detail}</small>
                </button>
              )) : <p>No matches</p>}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
