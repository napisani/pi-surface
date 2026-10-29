import { DeltaBadge } from "./DeltaBadge.tsx";
import { ImpactList } from "../../../../web/kit/ImpactList.tsx";
import { Badge } from "../../../../web/kit/primitives/Badge.tsx";
import { Panel } from "../../../../web/kit/primitives/Panel.tsx";
import { specDimensionsOf, type Decision, type ForgeState } from "../state.ts";
import css from "./DecisionTable.module.css";
import { usePost } from "./hooks.ts";
import { openQuestion } from "./nav.ts";

function DecisionBadge({ decision }: { decision: Decision }) {
  if (decision.status === "reopened") {
    return <Badge tone="err">reopened</Badge>;
  }
  if (decision.status === "deferred") {
    return <Badge tone="info">deferred</Badge>;
  }
  return decision.overrodeRecommendation ? <Badge tone="link">override</Badge> : null;
}

function Row({ state, d }: { state: ForgeState; d: Decision }) {
  const post = usePost();
  const q = state.questions.find((x) => x.id === d.id);
  const o = d.status === "decided" ? q?.options.find((x) => x.id === d.optionId) : undefined;
  const badge = <DecisionBadge decision={d} />;
  const chips = specDimensionsOf(state).filter((dim) => o?.specDelta?.[dim.id]);
  return (
    <tr>
      <td>
        <button type="button" className={css.link} onClick={() => openQuestion(d.id)}>
          {d.id}
        </button>{" "}
        {q?.header}
      </td>
      <td>
        {d.label} {badge}
        {d.note ? <div className={css.why}>{d.note}</div> : null}
      </td>
      <td>
        {d.status !== "decided" ? <span className={css.why}>Counts as TBD in drafts.</span> : <ImpactList items={o?.impact} />}
        {chips.length ? (
          <div className={css.chips}>
            {chips.map((dim) => (
              <DeltaBadge key={dim.id} dimension={dim} value={o!.specDelta![dim.id]} />
            ))}
          </div>
        ) : null}
      </td>
      <td>
        {d.status === "reopened" ? null : (
          <button type="button" className={css.link} onClick={() => void post({ type: "revisit", decisionId: d.id })}>
            revisit
          </button>
        )}
      </td>
    </tr>
  );
}

/** Every decision, what was chosen, and what it changes in the spec. */
export function DecisionTable({ state }: { state: ForgeState }) {
  return (
    <div className={css.wrap}>
      <Panel>
        <h3>Decisions and what they change</h3>
        <table className={css.table}>
          <thead>
            <tr>
              <th>Decision</th>
              <th>Choice</th>
              <th>What it changes</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {state.decisions.length ? (
              state.decisions.map((d) => <Row key={d.id} state={state} d={d} />)
            ) : (
              <tr>
                <td colSpan={4} className={css.why}>
                  No decisions yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
