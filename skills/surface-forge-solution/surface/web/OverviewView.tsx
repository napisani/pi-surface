// The Overview: the design as a whole, every decision so far, what it does
// to the spec, and the drafts with TBD where a decision is still missing.
import { DeltaBars } from "../../../../web/kit/DeltaBars.tsx";
import { Note } from "../../../../web/kit/primitives/Note.tsx";
import { Panel } from "../../../../web/kit/primitives/Panel.tsx";
import { Sub } from "../../../../web/kit/primitives/Sub.tsx";
import type { ForgeState, QuestionStatus } from "../state.ts";
import { DecisionMap } from "./DecisionMap.tsx";
import { DecisionTable } from "./DecisionTable.tsx";
import { DraftPanel } from "./DraftPanel.tsx";
import { useForge } from "./hooks.ts";
import css from "./OverviewView.module.css";

const selectState = (s: ForgeState) => s;

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <div className={css.metric}>
      <div className={css.value}>{value}</div>
      <div className={css.key}>{label}</div>
    </div>
  );
}

export function OverviewView() {
  const state = useForge(selectState);
  const decided = state.decisions.flatMap((d) => {
    if (d.status !== "decided") {
      return [];
    }
    const q = state.questions.find((x) => x.id === d.id);
    return [{ d, o: q?.options.find((x) => x.id === d.optionId) }];
  });
  const count = (status: QuestionStatus) => state.questions.filter((q) => q.status === status).length;
  const totals = Object.fromEntries(state.specDimensions.map((dim) => [dim.id, decided.reduce((n, { o }) => n + (o?.specDelta?.[dim.id] ?? 0), 0)]));
  const range = Math.max(3, ...Object.values(totals).map(Math.abs));
  return (
    <>
      <h2>Overview</h2>
      <Sub>The design as a whole: every decision so far, what it does to the spec, and a draft of the spec or RFC with TBD where a decision is still missing.</Sub>
      <div className={css.metrics}>
        <Metric value={decided.length} label="decided" />
        <Metric value={count("open")} label="open" />
        <Metric value={count("deferred")} label="deferred" />
        <Metric value={decided.filter(({ d }) => d.overrodeRecommendation).length} label="overrode the recommendation" />
      </div>
      <div className={css.grid}>
        <Panel>
          <h3>
            Decision map <span className={css.note}>· by round · click a decision to open it</span>
          </h3>
          <DecisionMap state={state} />
        </Panel>
        <Panel>
          <h3>
            Net effect on the spec <span className={css.note}>· sum of your decided choices</span>
          </h3>
          <DeltaBars dimensions={state.specDimensions} deltas={totals} range={range} />
          <Note>Bars to the right add work or risk. Bars to the left remove it. Secret exposure reduced is the exception: right is better.</Note>
        </Panel>
      </div>
      <DraftPanel />
      <DecisionTable state={state} />
    </>
  );
}
