// The plan page: the map of questions, one decision at a time, the
// architecture they lead to, the slices that build it, and the documents for buy-in.
import { Activity } from "react";
import { ErrorBoundary } from "../../../../web/kit/ErrorBoundary.tsx";
import { useHashChoice } from "../../../../web/kit/hooks/useHashState.ts";
import { KeyboardScope } from "../../../../web/kit/KeyboardScope.tsx";
import { PageHeader, tabCount, type HeaderTab } from "../../../../web/kit/PageHeader.tsx";
import { Banner } from "../../../../web/kit/primitives/Banner.tsx";
import { Button } from "../../../../web/kit/primitives/Button.tsx";
import { PageMain } from "../../../../web/kit/shell.tsx";
import { usePending } from "../../../../web/kit/store.ts";
import { frontier, type PlanState } from "../state.ts";
import { ArchitectureView } from "./ArchitectureView.tsx";
import { ArtifactsView } from "./ArtifactsView.tsx";
import { DecisionView } from "./DecisionView.tsx";
import { usePlan, usePlanState, usePost } from "./hooks.ts";
import { MapView } from "./MapView.tsx";
import { TABS, type Tab } from "./nav.ts";
import css from "./PlanPage.module.css";
import { SlicesView } from "./SlicesView.tsx";

const selectHolder = (s: PlanState) => s.lockHolder;
const selectReadOnly = (s: PlanState) => s.readOnly;
const selectDir = (s: PlanState) => s.ref?.dir ?? "";

const VIEWS = { map: MapView, decide: DecisionView, arch: ArchitectureView, slices: SlicesView, docs: ArtifactsView } satisfies Record<Tab, () => React.JSX.Element>;

export function PlanPage() {
  const post = usePost();
  const plan = usePlan();
  const readOnly = usePlanState(selectReadOnly);
  const holder = usePlanState(selectHolder);
  const dir = usePlanState(selectDir);
  const refreshing = usePending("refresh");
  const [tab, setTab] = useHashChoice<Tab>("tab", "map", TABS);
  const reports = plan.reports.filter((p) => !p.acknowledged).length;
  const tabs: readonly HeaderTab<Tab>[] = [
    { id: "map", label: "Map", count: tabCount(frontier(plan).length) },
    { id: "decide", label: "Decision" },
    { id: "arch", label: "Architecture" },
    { id: "slices", label: "Slices", count: reports ? `${reports}!` : tabCount(plan.slices.length) },
    { id: "docs", label: "Artifacts" },
  ];
  return (
    <>
      <PageHeader
        brand="plan"
        title={
          <span className={css.crumb} title={dir}>
            {plan.title}
          </span>
        }
        actions={
          <Button size="small" disabled={refreshing} title="Reload the plan from disk and take in slice reports" onClick={() => void post({ type: "refresh" }, "refresh")}>
            ↻ Refresh
          </Button>
        }
        tabs={tabs}
        tab={tab}
        onTab={setTab}
      />
      <PageMain>
        {readOnly ? (
          <Banner tone="warn">
            <span>Read-only: session {holder ?? "another session"} is editing this plan. Changes here are refused until you take it over.</span>
            <Button size="small" onClick={() => void post({ type: "lock.takeOver" }, "takeover")}>
              Take over editing
            </Button>
          </Banner>
        ) : null}
        {TABS.map((id) => {
          const View = VIEWS[id];
          return (
            <Activity key={id} mode={tab === id ? "visible" : "hidden"}>
              <ErrorBoundary name={id}>
                <KeyboardScope name={id} active={tab === id}>
                  <View />
                </KeyboardScope>
              </ErrorBoundary>
            </Activity>
          );
        })}
      </PageMain>
    </>
  );
}
