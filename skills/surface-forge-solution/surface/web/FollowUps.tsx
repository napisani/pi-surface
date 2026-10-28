import { cx } from "../../../../web/kit/cx.ts";
import { AskRow } from "../../../../web/kit/primitives/AskRow.tsx";
import { Note } from "../../../../web/kit/primitives/Note.tsx";
import { Panel } from "../../../../web/kit/primitives/Panel.tsx";
import { usePending } from "../../../../web/kit/store.ts";
import type { Question } from "../state.ts";
import css from "./FollowUps.module.css";
import { usePost } from "./hooks.ts";

/** Questions to the agent about one decision; asking does not answer it. */
export function FollowUps({ question: q, selectedId }: { question: Question; selectedId: string }) {
  const post = usePost();
  const key = `followUp:${q.id}`;
  const waiting = usePending(key) || q.thread.at(-1)?.role === "user";
  const optionLabel = (id: string) => q.options.find((o) => o.id === id)?.label ?? id;
  return (
    <Panel>
      <h3>Follow-up on this question</h3>
      <div className={css.thread}>
        {q.thread.length || waiting ? (
          <>
            {q.thread.map((m, i) => (
              <div key={`${m.at}:${i}`} className={cx(css.msg, m.role === "user" ? css.user : css.agent)}>
                <small>{m.role === "user" ? `you${m.optionId ? ` · on “${optionLabel(m.optionId)}”` : ""}` : "agent"}</small>
                {m.text}
              </div>
            ))}
            {waiting ? (
              <div className={cx(css.msg, css.thinking)}>
                <small>agent</small>thinking…
              </div>
            ) : null}
          </>
        ) : (
          <div className={css.why}>No follow-ups yet.</div>
        )}
      </div>
      <AskRow
        key={q.id}
        placeholder="Ask about the selected option, or challenge a score…"
        pendingKey={key}
        onSend={(text) => post({ type: "followUp", questionId: q.id, optionId: selectedId, text }, key)}
      />
      <Note>Goes to the agent. Asking does not answer the question.</Note>
    </Panel>
  );
}
