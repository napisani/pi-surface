// The Decision tab's node list: every question grouped by what it needs next,
// each saying in words where it stands and what it waits on.
import { useMemo, useState } from "react";
import { cx } from "../../../../web/kit/cx.ts";
import type { Plan } from "../state.ts";
import { GROUP_LABEL, groupNodes, groupOf, statusLine } from "./navigator.ts";
import { openNode } from "./nav.ts";
import css from "./NodeNav.module.css";

export function NodeNav({ plan, current }: { plan: Plan; current: string }) {
  const [filter, setFilter] = useState("");
  const groups = useMemo(() => groupNodes(plan, filter), [plan, filter]);
  const [closed, setClosed] = useState<ReadonlySet<string>>(() => new Set(["decided", "deferred"]));
  const toggle = (group: string) => setClosed((prev) => (prev.has(group) ? new Set([...prev].filter((g) => g !== group)) : new Set([...prev, group])));
  return (
    <nav className={css.rail} aria-label="Questions">
      <input className={css.filter} placeholder={`Filter ${plan.nodes.length} questions…`} value={filter} onChange={(e) => setFilter(e.target.value)} />
      {groups.map(({ group, nodes }) => {
        const open = Boolean(filter) || !closed.has(group) || nodes.some((n) => n.id === current);
        return (
          <section key={group} className={css[group]}>
            <button type="button" className={css.head} aria-expanded={open} onClick={() => toggle(group)}>
              <span className={css.dot} />
              {GROUP_LABEL[group]}
              <span className={css.count}>{nodes.length}</span>
              <span className={css.caret}>{open ? "▾" : "▸"}</span>
            </button>
            {open
              ? nodes.map((n) => (
                  <button key={n.id} type="button" className={cx(css.row, n.id === current && css.on)} onClick={() => openNode(n.id)} aria-current={n.id === current ? "true" : undefined}>
                    <span className={css.title}>
                      <b>{n.id}</b> {n.title}
                    </span>
                    <span className={css.meta}>
                      <span className={css.kind}>
                        {n.type} · {n.mode}
                      </span>
                      <span className={cx(css.status, groupOf(plan, n) === "decided" && css.done)}>{statusLine(plan, n)}</span>
                    </span>
                  </button>
                ))
              : null}
          </section>
        );
      })}
      {groups.length ? null : <p className={css.none}>No question matches.</p>}
    </nav>
  );
}
