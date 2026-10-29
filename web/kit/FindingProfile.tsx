// A finding and its fix at a glance: the triage verdict, then every aspect
// scored on one radar, drawn over the other findings for comparison.
import { BUCKET_LABEL, FINDING_DIMENSIONS, type Finding, type Severity } from "../../src/kit/findings.ts";
import css from "./FindingProfile.module.css";
import { Badge, BUCKET_TONE } from "./primitives/Badge.tsx";
import { Radar, type RadarSeries } from "./Radar.tsx";
import { ScoreTable } from "./ScoreTable.tsx";

const SEVERITY_COLOR = { Critical: "var(--crit)", High: "var(--high)", Medium: "var(--med)", Low: "var(--low)" } satisfies Record<Severity, string>;
const OTHER_COLOR = "var(--dim)";
const DIM_LABELS = FINDING_DIMENSIONS.map((d) => d.label);

const valuesOf = (f: Finding) => FINDING_DIMENSIONS.map((d) => f.scores?.[d.id]?.value ?? 0);

export interface FindingProfileProps {
  finding: Finding;
  /** Other scored findings, drawn faint behind this one. */
  others: readonly Finding[];
  /** Files the fix touches that the diff does not. */
  outside: readonly string[];
}

export function FindingProfile({ finding: f, others, outside }: FindingProfileProps) {
  const t = f.triage;
  const scores = f.scores;
  if (!t && !scores) {
    return null;
  }
  const color = SEVERITY_COLOR[f.severity];
  const series: RadarSeries[] = [...others.map((o) => ({ color: OTHER_COLOR, on: false, values: valuesOf(o) })), { color, on: true, values: valuesOf(f) }];
  return (
    <>
      {t ? (
        <>
          <h3>Triage</h3>
          <div className={css.head}>
            <Badge tone={BUCKET_TONE[t.bucket]}>{BUCKET_LABEL[t.bucket]}</Badge>
            <Badge>{t.fixSize} fix</Badge>
            <Badge tone={outside.length ? "warn" : "teal"}>{outside.length ? "expands scope" : "in scope"}</Badge>
          </div>
          <p className={css.reason}>{t.reason}</p>
          <div className={css.touches}>
            <span className={css.faint}>Fix touches</span>
            {t.touches.map((path) => (
              <code key={path} className={outside.includes(path) ? css.outside : undefined} title={outside.includes(path) ? "outside the diff" : "in the diff"}>
                {path}
              </code>
            ))}
          </div>
        </>
      ) : null}
      {scores ? (
        <>
          <h3>
            Trade-offs <span className={css.note}>· the finding, then its fix</span>
          </h3>
          <p className={css.direction}>
            Further out is a stronger case for fixing it in this diff. Impact, likelihood and confidence describe the finding; the rest describe its fix, where 5 means cheap, contained and safe.
          </p>
          <div className={css.wrap}>
            <Radar dims={DIM_LABELS} series={series} />
            <ScoreTable dimensions={FINDING_DIMENSIONS} option={{ scores }} color={color} />
          </div>
          <div className={css.legend}>
            <span>
              <i className={css.dot} style={{ background: color }} />
              {f.id}
            </span>
            {others.length ? (
              <span>
                <i className={css.dot} style={{ background: OTHER_COLOR }} />
                {others.length} other finding{others.length === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>
        </>
      ) : null}
    </>
  );
}
