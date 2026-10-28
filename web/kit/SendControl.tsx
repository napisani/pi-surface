import { Button } from "./primitives/Button.tsx";
import { Spinner } from "./primitives/Spinner.tsx";
import css from "./SendControl.module.css";
import { usePending } from "./store.ts";

export interface SendControlProps {
  pending: number;
  sent: boolean;
  round: number;
  /** Singular and plural, e.g. ["request", "requests"]. */
  noun: readonly [string, string];
  /** What the agent is doing while a round is out, e.g. "Agent is applying round". */
  working: string;
  onSend(): void;
  onRecall(): void;
}

/** The header control: send the pending batch, or wait on the one in flight. */
export function SendControl({ pending, sent, round, noun, working, onSend, onRecall }: SendControlProps) {
  const sending = usePending("send");
  if (sent) {
    return (
      <span className={css.sendbar}>
        <Spinner /> {working} {round}
        <Button kind="ghost" size="small" title="Take the batch back to edit it; the agent may already have changed files" onClick={onRecall}>
          Recall
        </Button>
      </span>
    );
  }
  if (!pending) {
    return null;
  }
  return (
    <Button kind="primary" disabled={sending} onClick={onSend}>
      Send {pending} {noun[pending === 1 ? 0 : 1]}
    </Button>
  );
}
