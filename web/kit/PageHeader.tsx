import type { ReactNode } from "react";
import { cx } from "./cx.ts";
import css from "./PageHeader.module.css";
import { useConn, type Conn } from "./store.ts";
import { useCommands, useKeyboard } from "./keyboardContext.ts";

const CONN_LABEL = { live: "● live", down: "reconnecting…", connecting: "connecting…" } satisfies Record<Conn, string>;

/** The count a tab shows: an ellipsis while its work runs, nothing for zero. */
export function tabCount(n: number, running = false): string {
  if (running) {
    return "…";
  }
  return n ? String(n) : "";
}

export interface HeaderTab<T extends string> {
  id: T;
  label: string;
  count?: string;
}

/** The page header every workflow shares: brand, title, actions, connection state and tabs. */
export function PageHeader<T extends string>(props: { brand: string; title?: ReactNode; actions?: ReactNode; tabs?: readonly HeaderTab<T>[]; tab?: T; onTab?: (tab: T) => void }) {
  const conn = useConn();
  const keyboard = useKeyboard();
  useCommands([
    { id: "surface.views", label: "Find an app view", keys: ["<leader>fe"], run: () => keyboard?.pick("Views", (props.tabs ?? []).map((tab) => ({ id: tab.id, label: tab.label, run: () => props.onTab?.(tab.id) }))) },
    ...(props.tabs ?? []).map((tab) => ({ id: `surface.view.${tab.id}`, label: `Open ${tab.label}`, keys: [], run: () => props.onTab?.(tab.id) })),
  ], Boolean(props.tabs));
  return (
    <header className={css.header}>
      <span className={css.brand}>{props.brand}</span>
      {props.title}
      <span className={cx(css.conn, conn === "live" && css.live, conn === "down" && css.down)}>{CONN_LABEL[conn]}</span>
      {props.actions}
      {keyboard ? <button type="button" className={css.tab} onClick={() => keyboard.searchCommands()} title="Search commands and keybindings">Keys</button> : null}
      {props.tabs ? (
        <nav className={css.tabs}>
          {props.tabs.map((t) => (
            <button key={t.id} type="button" className={cx(css.tab, props.tab === t.id && css.on)} onClick={() => props.onTab?.(t.id)}>
              {t.label}
              {t.count ? <span className={css.count}>{t.count}</span> : null}
            </button>
          ))}
        </nav>
      ) : null}
    </header>
  );
}
