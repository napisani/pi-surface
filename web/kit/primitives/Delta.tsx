import { cx } from "../cx.ts";
import css from "./Delta.module.css";

/** Added and removed line counts, e.g. +4 −1. */
export function Delta({ additions, deletions, small }: { additions: number; deletions: number; small?: boolean }) {
  return (
    <span className={cx(css.delta, small && css.small)}>
      <span className={css.add}>+{additions}</span>
      <span className={css.del}>−{deletions}</span>
    </span>
  );
}
