import { useRef } from "react";
import { AgentComposer } from "../../../../web/kit/AgentComposer.tsx";
import { ChatThread } from "../../../../web/kit/ChatThread.tsx";
import { AskRow } from "../../../../web/kit/primitives/AskRow.tsx";
import { Note } from "../../../../web/kit/primitives/Note.tsx";
import { Panel } from "../../../../web/kit/primitives/Panel.tsx";
import type { Finding } from "../state.ts";
import css from "./FollowUps.module.css";
import { usePost } from "./hooks.ts";

/** Questions to the agent about one finding; asking does not decide it. */
export function FollowUps({ finding: f }: { finding: Finding }) {
  const post = usePost();
  const conversation = useRef<HTMLDivElement>(null);
  const key = `followUp:${f.id}`;
  const ask = (text: string) => post({ type: "followUp", findingId: f.id, text }, key);
  return (
    <Panel>
      <h3>Follow-up on this finding</h3>
      <AgentComposer id="entropy.finding" prepare={() => ({ key: `finding:${f.id}`, label: f.title, reference: f.id, ask, onSent: () => conversation.current?.focus() })} />
      <div className={css.thread} ref={conversation} tabIndex={-1}>
        {f.thread.length ? <ChatThread messages={f.thread} /> : <div className={css.why}>No follow-ups yet.</div>}
      </div>
      <AskRow key={f.id} placeholder="Ask about the change, or challenge a score…" pendingKey={key} onSend={ask} />
      <Note>Goes to the agent. Asking does not accept or decline the finding.</Note>
    </Panel>
  );
}
