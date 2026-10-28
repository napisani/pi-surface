import type { ImpactItem } from "../../src/kit/options.ts";
import css from "./ImpactList.module.css";

/** What an option does to the spec, one colored line per change. */
export function ImpactList({ items, empty = "No spec impact listed." }: { items: readonly ImpactItem[] | undefined; empty?: string }) {
  return (
    <ul className={css.impact}>
      {items?.length ? (
        items.map((i) => (
          <li key={`${i.kind}:${i.text}`} className={css[i.kind]}>
            {i.text}
          </li>
        ))
      ) : (
        <li className={css.empty}>{empty}</li>
      )}
    </ul>
  );
}
