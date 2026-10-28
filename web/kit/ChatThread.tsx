import type { ThreadMessage } from "../../src/kit/thread.ts";
import { awaitingAgent } from "../../src/kit/thread.ts";
import css from "./ChatThread.module.css";
import { cx } from "./cx.ts";
import { Markdown } from "./Markdown.tsx";
import { Working } from "./primitives/Working.tsx";

/** Messages as chat bubbles, with a waiting line while the agent owes an answer. */
export function ChatThread({ messages, waiting = "waiting for the agent…" }: { messages: readonly ThreadMessage[]; waiting?: string }) {
  return (
    <div className={css.thread}>
      {messages.map((m, i) => (
        <div key={`${m.at}:${i}`} className={cx(css.msg, css[m.role])}>
          <span className={css.who}>{m.role === "user" ? "you" : "agent"}</span>
          <Markdown text={m.text} />
        </div>
      ))}
      {awaitingAgent(messages) ? <Working>{waiting}</Working> : null}
    </div>
  );
}
