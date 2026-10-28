import type { DataTable } from "../../src/kit/code.ts";
import css from "./DataTableView.module.css";

/** A table from a visual, with rows the agent marked good or bad tinted. */
export function DataTableView({ table }: { table: DataTable }) {
  return (
    <div className={css.wrap}>
      <table className={css.table}>
        {table.caption ? <caption>{table.caption}</caption> : null}
        <thead>
          <tr>
            {table.headers.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, r) => {
            const tone = table.highlight?.[String(r)];
            return (
              <tr key={r} className={tone ? css[tone] : undefined}>
                {row.map((cell, c) => (
                  <td key={c}>{cell}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
