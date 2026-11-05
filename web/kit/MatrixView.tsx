import { useMemo, useState } from "react";
import type { MatrixCell } from "../../src/kit/code.ts";
import { cx } from "./cx.ts";
import css from "./MatrixView.module.css";

const TONE_RANK = { good: 0, undefined: 1, warn: 2, bad: 3 } as const;

/** Compares cells by tone, then as numbers when both read as numbers, then as text. */
function compare(a: MatrixCell, b: MatrixCell): number {
  const tone = TONE_RANK[a.tone ?? "undefined"] - TONE_RANK[b.tone ?? "undefined"];
  if (tone) {
    return tone;
  }
  const [x, y] = [Number.parseFloat(a.value), Number.parseFloat(b.value)];
  return Number.isFinite(x) && Number.isFinite(y) ? x - y : a.value.localeCompare(b.value);
}

/** Rows compared across columns; clicking a column header sorts by it. */
export function MatrixView({ rows, columns, cells }: { rows: readonly string[]; columns: readonly string[]; cells: readonly (readonly MatrixCell[])[] }) {
  const [sortBy, setSortBy] = useState<number | null>(null);
  const order = useMemo(() => {
    const indexes = rows.map((_, i) => i);
    return sortBy === null ? indexes : indexes.sort((a, b) => compare(cells[a][sortBy], cells[b][sortBy]));
  }, [rows, cells, sortBy]);
  return (
    <div className={css.wrap}>
      <table className={css.table}>
        <thead>
          <tr>
            <th />
            {columns.map((c, i) => (
              <th key={c}>
                <button type="button" className={cx(css.sort, sortBy === i && css.on)} title="Sort by this column" onClick={() => setSortBy(sortBy === i ? null : i)}>
                  {c}
                  {sortBy === i ? " ↓" : ""}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {order.map((r) => (
            <tr key={rows[r]}>
              <th scope="row">{rows[r]}</th>
              {cells[r].map((cell, c) => (
                <td key={c} className={cell.tone ? css[cell.tone] : undefined} title={cell.note}>
                  {cell.value}
                  {cell.note ? <span className={css.dot}>•</span> : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
