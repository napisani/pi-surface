// The forge page: one design decision at a time on Questions, the whole
// design on Overview, with drafts of the spec and RFC and their approval.
import { Activity } from "react";
import { cx } from "../../../../web/kit/cx.ts";
import { ErrorBoundary } from "../../../../web/kit/ErrorBoundary.tsx";
import { useHashChoice } from "../../../../web/kit/hooks/useHashState.ts";
import { PageHeader, type HeaderTab } from "../../../../web/kit/PageHeader.tsx";
import { PageMain } from "../../../../web/kit/shell.tsx";
import { usePending } from "../../../../web/kit/store.ts";
import type { ForgeState } from "../state.ts";
import css from "./ForgePage.module.css";
import { useForge, usePost } from "./hooks.ts";
import { VIEWS, type View } from "./nav.ts";
import { OverviewView } from "./OverviewView.tsx";
import { QuestionsView } from "./QuestionsView.tsx";

const TABS: readonly HeaderTab<View>[] = [
  { id: "q", label: "Questions" },
  { id: "o", label: "Overview" },
];

const selectTitle = (s: ForgeState) => s.title;
const selectRound = (s: ForgeState) => s.round;
const selectRfc = (s: ForgeState) => s.rfcRequested;

export function ForgePage() {
  const post = usePost();
  const title = useForge(selectTitle);
  const round = useForge(selectRound);
  const rfc = useForge(selectRfc);
  const toggling = usePending("rfc");
  const [view, setView] = useHashChoice<View>("view", "q", VIEWS);
  return (
    <>
      <PageHeader
        brand="forge"
        title={
          <span className={css.crumb}>
            {title} · round {round}
          </span>
        }
        actions={
          <button
            type="button"
            className={cx(css.rfc, rfc && css.on)}
            title="Also write an RFC alongside the tech spec"
            disabled={toggling}
            onClick={() => void post({ type: "rfc", requested: !rfc }, "rfc")}
          >
            {rfc ? "✓ RFC requested" : "+ Also write RFC"}
          </button>
        }
        tabs={TABS}
        tab={view}
        onTab={setView}
      />
      <PageMain className={css.main}>
        <Activity mode={view === "q" ? "visible" : "hidden"}>
          <ErrorBoundary name="questions">
            <QuestionsView />
          </ErrorBoundary>
        </Activity>
        <Activity mode={view === "o" ? "visible" : "hidden"}>
          <ErrorBoundary name="overview">
            <OverviewView />
          </ErrorBoundary>
        </Activity>
      </PageMain>
    </>
  );
}
