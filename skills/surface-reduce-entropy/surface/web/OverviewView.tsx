// The Overview: what the accepted findings add up to, how much behavior they
// give up, and every finding on one radar and in one table.
import { useMemo } from "react";
import { Note } from "../../../../web/kit/primitives/Note.tsx";
import { Panel } from "../../../../web/kit/primitives/Panel.tsx";
import { Sub } from "../../../../web/kit/primitives/Sub.tsx";
import { Radar, type RadarSeries } from "../../../../web/kit/Radar.tsx";
import { CONCESSION_HINT, CONCESSION_LABEL, CONCESSIONS, ENTROPY_DIMENSIONS, KEEP_SCORES, netEffect, ordered, radarValues, type EntropyState, type Finding } from "../state.ts";
import { ConcessionBadge } from "./ConcessionBadge.tsx";
import { useEntropy } from "./hooks.ts";
import { openFinding } from "./nav.ts";
import css from "./OverviewView.module.css";
import { SendBanner } from "./SendDecisions.tsx";

const selectFindings = (s: EntropyState) => s.findings;
const STATUS_COLOR = { open: "var(--amber)", accepted: "var(--teal)", declined: "var(--faint)" } satisfies Record<Finding["status"], string>;
const DIM_LABELS = ENTROPY_DIMENSIONS.map((d) => d.label);

function Metric({ value, label }: { value: string | number; label: string }) {
  return (
    <div className={css.metric}>
      <div className={css.value}>{value}</div>
      <div className={css.key}>{label}</div>
    </div>
  );
}

export function OverviewView() {
  const raw = useEntropy(selectFindings);
  const findings = useMemo(() => ordered(raw), [raw]);
  const net = netEffect(findings);
  const open = findings.filter((f) => f.status === "open").length;
  const most = Math.max(1, ...CONCESSIONS.map((c) => findings.filter((f) => f.concession === c).length));
  const series: RadarSeries[] = [
    { color: "var(--rose)", on: false, values: radarValues(KEEP_SCORES) },
    ...findings.map((f) => ({ color: STATUS_COLOR[f.status], on: f.status === "accepted", values: radarValues(f.scores) })),
  ];
  return (
    <>
      <SendBanner />
      <h2>Overview</h2>
      <Sub>What accepting adds up to: code and concepts removed, and the behavior given up for them.</Sub>
      <div className={css.metrics}>
        <Metric value={`${net.accepted} / ${findings.length}`} label="accepted" />
        <Metric value={open} label="open" />
        <Metric value={`−${net.lines}`} label="lines removed" />
        <Metric value={`−${net.concepts}`} label="concepts removed" />
      </div>
      <div className={css.grid}>
        <Panel>
          <h3>
            Behavior given up <span className={css.note}>· accepted of all findings, by concession</span>
          </h3>
          <div className={css.ladder}>
            {CONCESSIONS.map((c) => {
              const all = findings.filter((f) => f.concession === c).length;
              return [
                <span key={`${c}:label`} title={CONCESSION_HINT[c]}>
                  {CONCESSION_LABEL[c]}
                </span>,
                <div key={`${c}:bar`} className={css.bar}>
                  <b className={css.all} style={{ width: `${(all / most) * 100}%` }} />
                  <b className={css.taken} style={{ width: `${(net.givenUp[c] / most) * 100}%` }} />
                </div>,
                <span key={`${c}:count`} className={css.count}>
                  {net.givenUp[c]} / {all}
                </span>,
              ];
            })}
          </div>
          <Note>The filled part is what you accepted. Larger concessions further down give up more for their payoff.</Note>
        </Panel>
        <Panel>
          <h3>
            Trade-offs <span className={css.note}>· every finding on one radar</span>
          </h3>
          <Radar dims={DIM_LABELS} series={series} />
          <div className={css.legend}>
            <span>
              <i className={css.dot} style={{ background: STATUS_COLOR.accepted }} />
              accepted
            </span>
            <span>
              <i className={css.dot} style={{ background: STATUS_COLOR.open }} />
              open
            </span>
            <span>
              <i className={css.dot} style={{ background: STATUS_COLOR.declined }} />
              declined
            </span>
            <span>
              <i className={css.dot} style={{ background: "var(--rose)" }} />
              keep the code
            </span>
          </div>
        </Panel>
      </div>
      <div className={css.wrap}>
        <table className={css.table}>
          <thead>
            <tr>
              <th>Finding</th>
              <th>Concession</th>
              <th>Gives up</th>
              <th>Payoff</th>
              <th>Decision</th>
            </tr>
          </thead>
          <tbody>
            {findings.map((f) => (
              <tr key={f.id}>
                <td>
                  <button type="button" className={css.link} onClick={() => openFinding(f.id)}>
                    {f.id}
                  </button>
                  {f.title}
                </td>
                <td>
                  <ConcessionBadge concession={f.concession} />
                </td>
                <td className={css.why}>{f.givesUp}</td>
                <td className={css.mono}>
                  −{f.lines} lines, −{f.concepts.length} concept{f.concepts.length === 1 ? "" : "s"}
                </td>
                <td className={css[f.status]}>
                  {f.status}
                  {f.status !== "open" && f.note ? <div className={css.why}>{f.note}</div> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
