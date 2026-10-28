import type { ThreadMessage } from "../../src/kit/thread.ts";
import { cx } from "./cx.ts";
import { Markdown } from "./Markdown.tsx";
import css from "./MessageRows.module.css";

/** Messages as compact rows: who, then the text. */
export function MessageRows({ messages }: { messages: readonly ThreadMessage[] }) {
  return (
    <>
      {messages.map((m, i) => (
        <div key={`${m.at}:${i}`} className={css.msg}>
          <span className={css.who}>{m.role === "user" ? "you" : "agent"}</span>
          <Markdown text={m.text} className={cx(css.text, css[m.role])} />
        </div>
      ))}
    </>
  );
}
