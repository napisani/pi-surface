import type { SpecDimension } from "../../src/kit/options.ts";
import css from "./DeltaBars.module.css";

/** Green for a move the dimension's direction counts as a gain, red for a cost. */
export function deltaColor(dimension: SpecDimension, v: number): string {
  if (v === 0) {
    return "var(--faint)";
  }
  const gain = dimension.direction === "benefit" ? v > 0 : v < 0;
  return gain ? "var(--green)" : "var(--rose)";
}

/** Bars from a center line, one per spec dimension, colored by whether the move is a gain or a cost. */
export function DeltaBars({ dimensions, deltas, range = 3 }: { dimensions: readonly SpecDimension[]; deltas: Readonly<Record<string, number>>; range?: number }) {
  const unit = 48 / range;
  return (
    <div className={css.delta}>
      {dimensions.map((d) => {
        const v = deltas[d.id] ?? 0;
        const color = deltaColor(d, v);
        return [
          <span key={`${d.id}:label`}>{d.label}</span>,
          <div key={`${d.id}:bar`} className={css.bar}>
            <b className={css.fill} style={{ left: `${v < 0 ? 50 + v * unit : 50}%`, width: `${Math.abs(v) * unit}%`, background: color }} />
            <b className={css.axis} />
          </div>,
          <span key={`${d.id}:value`} className={css.value} style={{ color }}>
            {v > 0 ? "+" : ""}
            {v}
          </span>,
        ];
      })}
    </div>
  );
}
