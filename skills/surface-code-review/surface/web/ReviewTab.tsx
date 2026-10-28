// The Review tab: run the multi-valued review, then read, question, dismiss
// and turn its findings into comments or change requests.
import { useEffect, useRef, useState } from "react";
import { useHashState } from "../../../../web/kit/hooks/useHashState.ts";
import { Button } from "../../../../web/kit/primitives/Button.tsx";
import { EmptyState } from "../../../../web/kit/primitives/EmptyState.tsx";
import { Panel } from "../../../../web/kit/primitives/Panel.tsx";
import { TaskBar } from "../../../../web/kit/primitives/TaskBar.tsx";
import { usePending } from "../../../../web/kit/store.ts";
import { TaskBanner } from "../../../../web/kit/TaskBanner.tsx";
import type { ReviewState } from "../state.ts";
import { FindingDetail } from "./FindingDetail.tsx";
import { FindingList } from "./FindingList.tsx";
import { usePost, useReview } from "./hooks.ts";
import css from "./ReviewTab.module.css";

const selectRun = (s: ReviewState) => s.review;

function runLabel(running: boolean, done: boolean): string {
  if (running) {
    return "Review running…";
  }
  return done ? "Run again" : "Run review";
}

export function ReviewTab() {
  const post = usePost();
  const run = useReview(selectRun);
  const starting = usePending("review");
  const [focus, setFocus] = useState("");
  const [findingId, setFinding] = useHashState("finding", "");
  const detail = useRef<HTMLDivElement>(null);
  const running = run.status === "running";
  const active = run.findings.find((f) => f.id === findingId) ?? run.findings.find((f) => !f.dismissed);
  useEffect(() => {
    if (findingId) {
      detail.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }, [findingId]);
  return (
    <>
      <TaskBar
        title="Multi-valued review"
        sub="The agent reviews the diff for correctness, security, reliability, complexity, maintainability and code smells. It re-checks each finding against the code and drops the ones that don't hold."
      >
        <input placeholder="Optional focus, e.g. auth changes" value={focus} onChange={(e) => setFocus(e.target.value)} />
        <Button kind="primary" disabled={running || starting} onClick={() => void post({ type: "review.run", focus }, "review")}>
          {runLabel(running, run.status === "done")}
        </Button>
      </TaskBar>
      <TaskBanner task={run} running="The agent is reviewing the changes. Findings show up here when it's done." failed="Review failed" onStop={() => void post({ type: "task.stop", task: "review" })} />
      {run.findings.length > 0 || run.summary ? (
        <div className={css.layout}>
          <FindingList active={active?.id} onOpen={setFinding} />
          <div ref={detail} className={css.detail}>
            <Panel>{active ? <FindingDetail key={active.id} finding={active} /> : <EmptyState small>Pick a finding.</EmptyState>}</Panel>
          </div>
        </div>
      ) : null}
      {!run.findings.length && !run.summary && !running ? (
        <EmptyState title="No review yet.">Click Run review. Each finding comes with the code involved and a diagram or table where one helps.</EmptyState>
      ) : null}
    </>
  );
}
