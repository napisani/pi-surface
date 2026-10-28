import { SendControl } from "../../../../web/kit/SendControl.tsx";
import type { ReviewState } from "../state.ts";
import { useLive, usePost, useReview } from "./hooks.ts";

const NOUN = ["request", "requests"] as const;
const selectPending = (s: ReviewState) => s.requests.filter((r) => r.status === "pending").length;
const selectSent = (s: ReviewState) => s.requests.some((r) => r.status === "sent");
const selectRound = (s: ReviewState) => s.requestRound;

/** Send the pending change requests, or wait on the batch in flight. Live reviews only. */
export function ReviewSendControl() {
  const post = usePost();
  const live = useLive();
  const pending = useReview(selectPending);
  const sent = useReview(selectSent);
  const round = useReview(selectRound);
  if (!live) {
    return null;
  }
  return (
    <SendControl
      pending={pending}
      sent={sent}
      round={round}
      noun={NOUN}
      working="Agent is applying round"
      onSend={() => void post({ type: "requests.send" }, "send")}
      onRecall={() => void post({ type: "requests.recall" })}
    />
  );
}
