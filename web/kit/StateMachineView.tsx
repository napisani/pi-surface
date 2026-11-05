import { useMemo, useState } from "react";
import type { Graph, GraphTone, MachineState, MachineTransition } from "../../src/kit/code.ts";
import { GraphView } from "./GraphView.tsx";
import { Button } from "./primitives/Button.tsx";
import css from "./StateMachineView.module.css";

function toneOf(state: MachineState, current: string): GraphTone {
  if (state.id === current) {
    return "active";
  }
  if (state.bad) {
    return "bad";
  }
  return state.final ? "done" : "open";
}

/** A state machine to step through: fire an event, see where it lands, and spot the bad path. */
export function StateMachineView({ states, transitions }: { states: readonly MachineState[]; transitions: readonly MachineTransition[] }) {
  const initial = states.find((st) => st.initial)?.id ?? states[0].id;
  const [path, setPath] = useState<readonly { state: string; event?: string; bad?: boolean }[]>([{ state: initial }]);
  const current = path[path.length - 1].state;
  const graph = useMemo<Graph>(
    () => ({
      nodes: states.map((st) => ({ id: st.id, label: st.label, tone: toneOf(st, current) })),
      edges: transitions.map((t) => ({ from: t.from, to: t.to, label: t.event, dashed: t.bad })),
    }),
    [states, transitions, current],
  );
  const label = (id: string) => states.find((st) => st.id === id)?.label ?? id;
  const available = transitions.filter((t) => t.from === current);
  return (
    <div>
      <GraphView graph={graph} selected={current} />
      <div className={css.controls}>
        <span className={css.label}>In {label(current)}. Fire:</span>
        {available.length ? (
          available.map((t) => (
            <Button key={`${t.event}>${t.to}`} size="small" className={t.bad ? css.bad : undefined} onClick={() => setPath([...path, { state: t.to, event: t.event, bad: t.bad }])}>
              {t.event}
            </Button>
          ))
        ) : (
          <span className={css.label}>no events leave this state</span>
        )}
        <Button size="small" kind="ghost" disabled={path.length === 1} onClick={() => setPath([{ state: initial }])}>
          Reset
        </Button>
      </div>
      {path.length > 1 ? (
        <ol className={css.path}>
          {path.slice(1).map((step, i) => (
            <li key={i} className={step.bad || states.find((st) => st.id === step.state)?.bad ? css.bad : undefined}>
              {step.event} → {label(step.state)}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
