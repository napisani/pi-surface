import type { Question } from "../state.ts";
import { Panel } from "../../../../web/kit/primitives/Panel.tsx";
import { Radar } from "../../../../web/kit/Radar.tsx";
import { ScoreTable } from "../../../../web/kit/ScoreTable.tsx";
import css from "./TradeOffs.module.css";

/** Every option's scores as a radar, and the selected option's scores with reasons. */
export function TradeOffs({ question: q, selectedId, colorOf }: { question: Question; selectedId: string; colorOf(index: number): string }) {
  const selectedIndex = q.options.findIndex((o) => o.id === selectedId);
  const series = q.options.map((o, i) => ({ color: colorOf(i), on: o.id === selectedId, values: q.dimensions.map((d) => o.scores[d.id]?.value ?? 0) }));
  return (
    <Panel>
      <h3>
        Trade-offs <span className={css.note}>· scored for this question only</span>
      </h3>
      <div className={css.wrap}>
        <Radar dims={q.dimensions.map((d) => d.label)} series={series} />
        <ScoreTable dimensions={q.dimensions} option={q.options[selectedIndex]} color={colorOf(selectedIndex)} />
      </div>
      <div className={css.legend}>
        {q.options.map((o, i) => (
          <span key={o.id}>
            <i className={css.dot} style={{ background: colorOf(i) }} />
            {o.label}
          </span>
        ))}
        <span className={css.faint}>Scores compare these options only. Outer ring is better.</span>
      </div>
    </Panel>
  );
}
