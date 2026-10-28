// Batched work on the page (change requests, fixes): its thread, editing the
// pending instruction, and answering the agent's outcome.
import { useState } from "react";
import type { RoundStatus, RoundWork } from "../../src/kit/rounds.ts";
import { MessageRows } from "./MessageRows.tsx";
import { AskRow } from "./primitives/AskRow.tsx";
import { Button } from "./primitives/Button.tsx";
import { Row } from "./primitives/Row.tsx";
import { Working } from "./primitives/Working.tsx";

export const ROUND_LABEL = { pending: "not sent", sent: "with the agent", done: "done", declined: "declined", "needs-input": "needs your answer" } satisfies Record<RoundStatus, string>;

export interface RoundThreadProps {
  work: RoundWork;
  editing: boolean;
  onSave(text: string): Promise<boolean>;
  onCancel(): void;
  /** Pending key for the follow-up input. */
  followKey: string;
  onFollowUp(text: string): Promise<boolean>;
}

function EditLast({ text, onSave, onCancel }: { text: string; onSave(text: string): Promise<boolean>; onCancel(): void }) {
  const [value, setValue] = useState(text);
  return (
    <>
      <textarea rows={3} value={value} onChange={(e) => setValue(e.target.value)} />
      <Row end>
        <Button onClick={onCancel}>Cancel</Button>
        <Button kind="primary" onClick={() => void onSave(value)}>
          Save
        </Button>
      </Row>
    </>
  );
}

/** The work's messages; the last one is editable while pending, and an outcome can be answered. */
export function RoundThread({ work, editing, onSave, onCancel, followKey, onFollowUp }: RoundThreadProps) {
  const last = work.messages.length - 1;
  const answered = work.status === "done" || work.status === "declined" || work.status === "needs-input";
  return (
    <>
      <MessageRows messages={editing ? work.messages.slice(0, last) : work.messages} />
      {editing ? <EditLast text={work.messages[last]?.text ?? ""} onSave={onSave} onCancel={onCancel} /> : null}
      {work.status === "sent" ? <Working>The agent is working on this batch…</Working> : null}
      {answered ? (
        <AskRow
          placeholder={work.status === "needs-input" ? "Answer the agent…" : "Not quite? Say what to change…"}
          pendingKey={followKey}
          label={work.status === "needs-input" ? "Answer" : "Reply"}
          onSend={onFollowUp}
        />
      ) : null}
    </>
  );
}
