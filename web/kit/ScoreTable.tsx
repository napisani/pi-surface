import type { Dimension, Option } from "../../src/kit/options.ts";
import css from "./ScoreTable.module.css";

const PIPS = [1, 2, 3, 4, 5];

/** The selected option's score and reason on each dimension. */
export function ScoreTable({ dimensions, option, color }: { dimensions: readonly Dimension[]; option: Option; color: string }) {
  return (
    <table className={css.dims}>
      <tbody>
        {dimensions.map((d) => {
          const score = option.scores[d.id];
          return (
            <tr key={d.id}>
              <td className={css.label}>
                {d.label}
                <div className={css.why}>{d.hint ?? ""}</div>
              </td>
              <td>
                <span className={css.score} style={{ "--c": color }}>
                  {PIPS.map((i) => (
                    <i key={i} className={i <= (score?.value ?? 0) ? css.on : undefined} />
                  ))}
                </span>
                <div className={css.why}>{score?.why ?? ""}</div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
