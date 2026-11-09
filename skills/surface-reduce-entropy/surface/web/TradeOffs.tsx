// Accepting a finding against keeping the code as it is, on one radar, with
// the other findings faint behind it for scale.
import { Panel } from "../../../../web/kit/primitives/Panel.tsx";
import { Radar, type RadarSeries } from "../../../../web/kit/Radar.tsx";
import { ScoreTable } from "../../../../web/kit/ScoreTable.tsx";
import { ENTROPY_DIMENSIONS, KEEP_SCORES, radarValues, type Finding } from "../state.ts";
import css from "./TradeOffs.module.css";

const ACCEPT_COLOR = "var(--teal)";
const KEEP_COLOR = "var(--rose)";
const OTHER_COLOR = "var(--faint)";
const DIM_LABELS = ENTROPY_DIMENSIONS.map((d) => d.label);

export function TradeOffs({ finding: f, others }: { finding: Finding; others: readonly Finding[] }) {
  const series: RadarSeries[] = [
    ...others.map((o) => ({ color: OTHER_COLOR, on: false, values: radarValues(o.scores) })),
    { color: KEEP_COLOR, on: false, values: radarValues(KEEP_SCORES) },
    { color: ACCEPT_COLOR, on: true, values: radarValues(f.scores) },
  ];
  return (
    <Panel>
      <h3>
        Trade-offs <span className={css.note}>· accepting against keeping the code</span>
      </h3>
      <p className={css.direction}>Further out is better on every axis. Keeping the code removes nothing and risks nothing, so it hugs the behavior, reversibility and safety axes.</p>
      <div className={css.wrap}>
        <Radar dims={DIM_LABELS} series={series} />
        <ScoreTable dimensions={ENTROPY_DIMENSIONS} option={f} color={ACCEPT_COLOR} />
      </div>
      <div className={css.legend}>
        <span>
          <i className={css.dot} style={{ background: ACCEPT_COLOR }} />
          Accept {f.id}
        </span>
        <span>
          <i className={css.dot} style={{ background: KEEP_COLOR }} />
          Decline: keep the code
        </span>
        {others.length ? (
          <span>
            <i className={css.dot} style={{ background: OTHER_COLOR }} />
            {others.length} other finding{others.length === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>
    </Panel>
  );
}
