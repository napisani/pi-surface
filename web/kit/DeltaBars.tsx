import type { Dimension } from "../../src/kit/options.ts";
import css from "./DeltaBars.module.css";

// Security is the one spec dimension where a higher number is the good direction.
export function deltaColor(dimId: string, v: number): string {
  if (v === 0) {
    return "var(--faint)";
  }
  return (dimId === "security" ? v < 0 : v > 0) ? "var(--rose)" : "var(--green)";
}

/** Bars from a center line: right adds work or risk, left removes it. */
export function DeltaBars({ dimensions, deltas, range = 3 }: { dimensions: readonly Dimension[]; deltas: Readonly<Record<string, number>>; range?: number }) {
  const unit = 48 / range;
  return (
    <div className={css.delta}>
      {dimensions.map((d) => {
        const v = deltas[d.id] ?? 0;
        const color = deltaColor(d.id, v);
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
