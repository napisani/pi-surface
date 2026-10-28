import type { RoundStatus } from "../../../../src/kit/rounds.ts";
import { AskRow } from "../../../../web/kit/primitives/AskRow.tsx";
import { EmptyState } from "../../../../web/kit/primitives/EmptyState.tsx";
import { Panel } from "../../../../web/kit/primitives/Panel.tsx";
import { TaskBar } from "../../../../web/kit/primitives/TaskBar.tsx";
import type { ReviewState } from "../state.ts";
import { usePost, useReview } from "./hooks.ts";
import { RequestCard } from "./RequestCard.tsx";
import { ReviewSendControl } from "./ReviewSendControl.tsx";

const GROUPS: readonly (readonly [string, RoundStatus])[] = [
  ["Not sent", "pending"],
  ["With the agent", "sent"],
  ["Needs your answer", "needs-input"],
  ["Done", "done"],
  ["Declined", "declined"],
];

const selectRequests = (s: ReviewState) => s.requests;

export function RequestsTab() {
  const post = usePost();
  const requests = useReview(selectRequests);
  return (
    <>
      <TaskBar
        title="Change requests"
        sub="Click + beside a line and choose Request change, or write a request about the whole change below. Send them as a batch; the agent edits your files and the diff reloads."
      >
        <ReviewSendControl />
      </TaskBar>
      <Panel>
        <AskRow
          placeholder="Request a change to the whole diff, e.g. rename check to verifyToken everywhere"
          pendingKey="general-request"
          label="Add request"
          onSend={(body) => post({ type: "request.create", body }, "general-request")}
        />
      </Panel>
      {requests.length === 0 ? <EmptyState small>No requests yet.</EmptyState> : null}
      {GROUPS.map(([label, status]) => {
        const group = requests.filter((r) => r.status === status);
        return group.length ? (
          <section key={status}>
            <h3>
              {label} ({group.length})
            </h3>
            {group.map((r) => (
              <RequestCard key={r.id} request={r} location />
            ))}
          </section>
        ) : null;
      })}
    </>
  );
}
