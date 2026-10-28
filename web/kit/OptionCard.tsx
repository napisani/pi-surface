// One option of a design decision: its description, pros and cons, and the
// visual for the lens the user is comparing by.
import { memo } from "react";
import type { Lens, Option } from "../../src/kit/options.ts";
import { cx } from "./cx.ts";
import css from "./OptionCard.module.css";
import { Badge } from "./primitives/Badge.tsx";
import { VisualBody } from "./VisualBody.tsx";

export const OPTION_COLORS = ["#e0a458", "#6fb7a8", "#a68fd6", "#7aa2d6"];

export interface OptionCardProps {
  option: Option;
  lens: Lens;
  color: string;
  selected: boolean;
  locked: boolean;
  chosen: boolean;
  onSelect(id: string): void;
}

export const OptionCard = memo(function OptionCard({ option: o, lens, color, selected, locked, chosen, onSelect }: OptionCardProps) {
  const visual = o.visuals[lens.id];
  // Replayed sessions can hold options that carry no pros or cons.
  const prosCons = o.pros?.length || o.cons?.length;
  return (
    <div className={cx(css.opt, selected && css.selected, locked && css.locked)} style={{ "--c": color }} onClick={() => onSelect(o.id)}>
      <div className={css.top}>
        <span className={css.dot} />
        <span className={css.label}>{o.label}</span>
        {o.recommended ? <Badge tone="amber">recommended</Badge> : null}
        {chosen ? <Badge>chosen</Badge> : null}
      </div>
      <p className={css.description}>{o.description}</p>
      {prosCons ? (
        <div className={css.proscons}>
          {o.pros?.length ? (
            <div className={css.pros}>
              <b>Pros</b>
              <ul>
                {o.pros.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {o.cons?.length ? (
            <div className={css.cons}>
              <b>Cons</b>
              <ul>
                {o.cons.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className={css.visHead}>
        <span className={css.lens}>{lens.label}</span>
        <span className={css.stat}>{visual?.stat ?? ""}</span>
      </div>
      {visual ? <VisualBody visual={visual} /> : <VisualBody visual={{ kind: "na", reason: "missing" }} />}
      {visual?.look ? <div className={css.look}>{visual.look}</div> : null}
    </div>
  );
});
