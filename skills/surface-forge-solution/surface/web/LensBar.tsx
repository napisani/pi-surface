import type { Lens } from "../../../../src/kit/options.ts";
import { cx } from "../../../../web/kit/cx.ts";
import css from "./LensBar.module.css";

/** Which view every option card shows. */
export function LensBar({ lenses, active, onPick }: { lenses: readonly Lens[]; active: string; onPick(id: string): void }) {
  return (
    <div className={css.bar}>
      <span className={css.label}>Compare options by</span>
      {lenses.map((l) => (
        <button key={l.id} type="button" className={cx(css.lens, l.id === active && css.on)} onClick={() => onPick(l.id)}>
          {l.label} <span className={css.kind}>{l.kind}</span>
        </button>
      ))}
    </div>
  );
}
