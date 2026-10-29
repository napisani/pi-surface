import { deltaColor } from "../../../../web/kit/DeltaBars.tsx";
import type { SpecDimension } from "../../../../src/kit/options.ts";
import css from "./DeltaBadge.module.css";

/** One spec dimension's change, colored by whether it helps or hurts. */
export function DeltaBadge({ dimension, value }: { dimension: SpecDimension; value: number }) {
  return (
    <span className={css.badge} style={{ color: deltaColor(dimension, value) }}>
      {dimension.label} {value > 0 ? "+" : ""}
      {value}
    </span>
  );
}
