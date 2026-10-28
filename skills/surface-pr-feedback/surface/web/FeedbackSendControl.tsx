import { SendControl } from "../../../../web/kit/SendControl.tsx";
import type { FeedbackState } from "../state.ts";
import { useFeedback, usePost } from "./hooks.ts";

const NOUN = ["fix", "fixes"] as const;
const selectPending = (s: FeedbackState) => s.items.filter((i) => i.fix?.status === "pending").length;
const selectSent = (s: FeedbackState) => s.items.some((i) => i.fix?.status === "sent");
const selectRound = (s: FeedbackState) => s.fixRound;

/** Send the queued fixes, or wait on the batch in flight. */
export function FeedbackSendControl() {
  const post = usePost();
  return (
    <SendControl
      pending={useFeedback(selectPending)}
      sent={useFeedback(selectSent)}
      round={useFeedback(selectRound)}
      noun={NOUN}
      working="Agent is fixing, round"
      onSend={() => void post({ type: "fixes.send" }, "send")}
      onRecall={() => void post({ type: "fixes.recall" })}
    />
  );
}
