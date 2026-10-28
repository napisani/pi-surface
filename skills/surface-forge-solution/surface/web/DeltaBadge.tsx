import { deltaColor } from "../../../../web/kit/DeltaBars.tsx";
import type { Dimension } from "../../../../src/kit/options.ts";
import css from "./DeltaBadge.module.css";

/** One spec dimension's change, colored by whether it helps or hurts. */
export function DeltaBadge({ dimension, value }: { dimension: Dimension; value: number }) {
  return (
    <span className={css.badge} style={{ color: deltaColor(dimension.id, value) }}>
      {dimension.label} {value > 0 ? "+" : ""}
      {value}
    </span>
  );
}
