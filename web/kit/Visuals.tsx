import { useState } from "react";
import type { LabeledVisual } from "../../src/kit/code.ts";
import { cx } from "./cx.ts";
import { VisualBody } from "./VisualBody.tsx";
import css from "./Visuals.module.css";

/** Visuals as tabs; opens on `initial`, which defaults to the first. */
export function Visuals({ visuals, initial = 0 }: { visuals: readonly LabeledVisual[]; initial?: number }) {
  const [active, setActive] = useState(initial);
  if (!visuals.length) {
    return null;
  }
  const index = Math.min(Math.max(active, 0), visuals.length - 1);
  const visual = visuals[index];
  return (
    <div className={css.vis}>
      <div className={css.tabs}>
        {visuals.map((v, i) => (
          <button key={i} type="button" className={cx(css.tab, i === index && css.on)} onClick={() => setActive(i)}>
            <span className={css.kind}>{v.kind}</span>
            {v.label}
          </button>
        ))}
      </div>
      <div className={css.body}>
        <VisualBody visual={visual} />
      </div>
      {visual.look ? <div className={css.look}>{visual.look}</div> : null}
    </div>
  );
}
