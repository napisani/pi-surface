// The one control that hands the user's decisions to the agent. Deciding a
// finding only records it; nothing reaches the agent until this is pressed.
import { useCommands } from "../../../../web/kit/keyboardContext.ts";
import { Banner } from "../../../../web/kit/primitives/Banner.tsx";
import { Button } from "../../../../web/kit/primitives/Button.tsx";
import { usePending } from "../../../../web/kit/store.ts";
import type { EntropyState } from "../state.ts";
import css from "./SendDecisions.module.css";
import { useEntropy, usePost } from "./hooks.ts";

const KEY = "submit";
const selectOpen = (s: EntropyState) => s.findings.filter((f) => f.status === "open").length;
const selectTotal = (s: EntropyState) => s.findings.length;
const selectSubmitted = (s: EntropyState) => Boolean(s.submitted);

function useSend() {
  const post = usePost();
  const open = useEntropy(selectOpen);
  const total = useEntropy(selectTotal);
  const submitted = useEntropy(selectSubmitted);
  const busy = usePending(KEY);
  const ready = total > 0 && open === 0 && !submitted;
  return { open, total, submitted, busy, ready, send: () => void post({ type: "submit" }, KEY) };
}

/** The header button: what is left to decide, then Send, then Sent. */
export function SendButton() {
  const { open, submitted, busy, ready, send } = useSend();
  useCommands([{ id: "entropy.submit", label: "Send decisions to the agent", keys: [], disabled: ready ? undefined : "Decide every finding first", run: send }]);
  if (submitted) {
    return <span className={css.sent}>✓ Sent to the agent</span>;
  }
  let label = `Decide ${open} more to send`;
  if (busy) {
    label = "Sending…";
  } else if (ready) {
    label = "Send decisions to the agent";
  }
  return (
    <Button kind="primary" disabled={!ready || busy} onClick={send} title={ready ? "Hand every decision to the agent" : "Decide every finding first"}>
      {label}
    </Button>
  );
}

/** Says, at the top of each view, whether the decisions have reached the agent yet. */
export function SendBanner() {
  const { open, total, submitted, busy, ready, send } = useSend();
  if (total === 0) {
    return null;
  }
  if (submitted) {
    return (
      <Banner tone="done">
        <span className={css.grow}>Your decisions were sent. The agent is writing the plan; reopening a finding means sending again.</span>
      </Banner>
    );
  }
  if (ready) {
    return (
      <Banner tone="warn">
        <span className={css.grow}>
          <b>Every finding is decided.</b> The agent has not seen your decisions yet.
        </span>
        <Button kind="primary" disabled={busy} onClick={send}>
          {busy ? "Sending…" : "Send decisions to the agent"}
        </Button>
      </Banner>
    );
  }
  return (
    <Banner tone="info">
      <span className={css.grow}>
        {total - open} of {total} decided. Accept or decline the rest, then send your decisions to the agent.
      </span>
    </Banner>
  );
}
