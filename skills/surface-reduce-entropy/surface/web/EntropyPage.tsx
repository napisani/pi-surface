// The entropy page: one simplification at a time on Findings, what the
// accepted ones add up to on Overview.
import { Activity } from "react";
import { ErrorBoundary } from "../../../../web/kit/ErrorBoundary.tsx";
import { useHashChoice } from "../../../../web/kit/hooks/useHashState.ts";
import { KeyboardScope } from "../../../../web/kit/KeyboardScope.tsx";
import { PageHeader, tabCount, type HeaderTab } from "../../../../web/kit/PageHeader.tsx";
import { PageMain } from "../../../../web/kit/shell.tsx";
import type { EntropyState } from "../state.ts";
import css from "./EntropyPage.module.css";
import { FindingsView } from "./FindingsView.tsx";
import { useEntropy } from "./hooks.ts";
import { VIEWS, type View } from "./nav.ts";
import { OverviewView } from "./OverviewView.tsx";
import { SendButton } from "./SendDecisions.tsx";

const selectScope = (s: EntropyState) => s.scope;
const selectOpen = (s: EntropyState) => s.findings.filter((f) => f.status === "open").length;

export function EntropyPage() {
  const scope = useEntropy(selectScope);
  const open = useEntropy(selectOpen);
  const [view, setView] = useHashChoice<View>("view", "f", VIEWS);
  const tabs: readonly HeaderTab<View>[] = [
    { id: "f", label: "Findings", count: tabCount(open) },
    { id: "o", label: "Overview" },
  ];
  return (
    <>
      <PageHeader brand="entropy" title={<span className={css.crumb}>{scope}</span>} actions={<SendButton />} tabs={tabs} tab={view} onTab={setView} />
      <PageMain className={css.main}>
        <Activity mode={view === "f" ? "visible" : "hidden"}>
          <ErrorBoundary name="findings">
            <KeyboardScope name="findings" active={view === "f"}>
              <FindingsView />
            </KeyboardScope>
          </ErrorBoundary>
        </Activity>
        <Activity mode={view === "o" ? "visible" : "hidden"}>
          <ErrorBoundary name="overview">
            <KeyboardScope name="overview" active={view === "o"}>
              <OverviewView />
            </KeyboardScope>
          </ErrorBoundary>
        </Activity>
      </PageMain>
    </>
  );
}
