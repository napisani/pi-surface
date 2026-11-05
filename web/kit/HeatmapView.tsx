import css from "./HeatmapView.module.css";

/** A grid of numbers shaded by size, so where change or risk gathers stands out. */
export function HeatmapView({ rows, columns, values }: { rows: readonly string[]; columns: readonly string[]; values: readonly (readonly number[])[] }) {
  const max = Math.max(1, ...values.flat());
  return (
    <div className={css.wrap}>
      <table className={css.table}>
        <thead>
          <tr>
            <th />
            {columns.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={row}>
              <th scope="row">{row}</th>
              {values[r].map((v, c) => (
                <td key={c} style={{ "--heat": `${Math.round((Math.max(0, v) / max) * 100)}%` }} title={`${row} · ${columns[c]}: ${v}`}>
                  {v || ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
