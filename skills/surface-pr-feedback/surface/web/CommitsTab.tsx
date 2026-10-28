// The Commits tab: the agent proposes commits for the fixes, the user edits
// and commits each one, then pushes. Replies that name a commit wait for it.
import { useState } from "react";
import type { CommitPlan } from "../../../../src/kit/commits.ts";
import { CommitPlanCard } from "../../../../web/kit/CommitPlanCard.tsx";
import { Banner } from "../../../../web/kit/primitives/Banner.tsx";
import { Button } from "../../../../web/kit/primitives/Button.tsx";
import { Panel } from "../../../../web/kit/primitives/Panel.tsx";
import { Row } from "../../../../web/kit/primitives/Row.tsx";
import { Spacer } from "../../../../web/kit/primitives/Spacer.tsx";
import { Spinner } from "../../../../web/kit/primitives/Spinner.tsx";
import { Sub } from "../../../../web/kit/primitives/Sub.tsx";
import { TaskBar } from "../../../../web/kit/primitives/TaskBar.tsx";
import { Text } from "../../../../web/kit/primitives/Text.tsx";
import { Working } from "../../../../web/kit/primitives/Working.tsx";
import { usePending } from "../../../../web/kit/store.ts";
import type { FeedbackState } from "../state.ts";
import { useFeedback, usePost } from "./hooks.ts";
import { openItem } from "./nav.ts";

const selectState = (s: FeedbackState) => s;

function PlanCard({ plan }: { plan: CommitPlan }) {
  const post = usePost();
  const key = `commit-${plan.id}`;
  return (
    <CommitPlanCard
      plan={plan}
      onEdit={(change) => post({ type: "commit.edit", commitId: plan.id, message: change.message ?? plan.message, items: plan.items, paths: change.paths ?? plan.paths }, key)}
      onDelete={() => void post({ type: "commit.delete", commitId: plan.id })}
      onCommit={() => void post({ type: "commit.run", commitId: plan.id }, key)}
      onOpenItem={openItem}
    />
  );
}

export function CommitsTab() {
  const post = usePost();
  const state = useFeedback(selectState);
  const proposing = usePending("propose");
  const [instruction, setInstruction] = useState("");
  const proposals = state.commits.filter((c) => c.status !== "committed");
  const committed = state.commits.filter((c) => c.status === "committed");
  const unpushed = committed.filter((c) => !c.pushed);
  const fixed = state.items.filter((i) => i.fix?.status === "done" && !committed.some((c) => c.items.includes(i.id)));
  const pushing = state.push.status === "pushing";
  return (
    <>
      <TaskBar title="Commits" sub={`The agent proposes; you commit. Only the listed paths go into each commit. Push sends them to ${state.pr ? state.pr.headRef : "the upstream branch"}.`}>
        <Button kind="primary" title="git push" disabled={pushing || !unpushed.length} onClick={() => void post({ type: "push" }, "push")}>
          {pushing ? (
            <>
              <Spinner /> Pushing…
            </>
          ) : (
            `Push ${unpushed.length || ""} commit${unpushed.length === 1 ? "" : "s"}`
          )}
        </Button>
      </TaskBar>
      {state.push.status === "failed" ? <Banner tone="err">Push failed: {state.push.error}</Banner> : null}
      <Panel>
        {state.proposing.status === "running" ? (
          <Row flush>
            <Working>The agent is grouping the fixes into commits{state.proposing.note ? `: ${state.proposing.note}` : "…"}</Working>
            <Spacer />
            <Button kind="ghost" size="small" title="Stop waiting for the agent" onClick={() => void post({ type: "task.stop", task: "proposing" })}>
              Stop
            </Button>
          </Row>
        ) : (
          <>
            <Sub>
              {fixed.length ? `${fixed.length} fixed item${fixed.length === 1 ? "" : "s"} not committed yet: ${fixed.map((i) => i.id).join(", ")}.` : "No fixed items are waiting for a commit."}
            </Sub>
            <Row>
              <input placeholder="Optional: how to group them, e.g. one commit per reviewer" value={instruction} onChange={(e) => setInstruction(e.target.value)} />
              <Button kind="primary" disabled={proposing} onClick={() => void post({ type: "commits.propose", instruction }, "propose")}>
                ✦ Propose commits
              </Button>
            </Row>
            {state.proposing.status === "failed" ? <Text tone="err">The agent could not propose commits: {state.proposing.note}</Text> : null}
          </>
        )}
      </Panel>
      {proposals.length ? (
        <>
          <h3>Proposed ({proposals.length})</h3>
          {proposals.map((p) => (
            <PlanCard key={p.id} plan={p} />
          ))}
        </>
      ) : null}
      {committed.length ? (
        <>
          <h3>Committed ({committed.length})</h3>
          {committed.toReversed().map((p) => (
            <PlanCard key={p.id} plan={p} />
          ))}
        </>
      ) : null}
    </>
  );
}
