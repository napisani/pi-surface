import { Markdown } from "../../../../web/kit/Markdown.tsx";
import { Badge } from "../../../../web/kit/primitives/Badge.tsx";
import { Card } from "../../../../web/kit/primitives/Card.tsx";
import { CardHead } from "../../../../web/kit/primitives/CardHead.tsx";
import { Spacer } from "../../../../web/kit/primitives/Spacer.tsx";
import { Text } from "../../../../web/kit/primitives/Text.tsx";
import type { SourceMessage } from "../state.ts";
import css from "./SourcePane.module.css";

/** What the reviewer wrote, with the rest of the thread. */
export function SourcePane({ messages }: { messages: readonly SourceMessage[] }) {
  return (
    <Card accent="remote">
      {messages.map((m, i) => (
        <div key={`${m.createdAt}:${i}`} className={css.msg}>
          <CardHead>
            <b>@{m.author}</b>
            {m.mine ? <Badge>you</Badge> : null}
            <Text tone="faint">{m.createdAt.slice(0, 10)}</Text>
            <Spacer />
            {m.url?.startsWith("https://") ? (
              <a href={m.url} target="_blank" rel="noreferrer">
                <Text tone="faint">↗</Text>
              </a>
            ) : null}
          </CardHead>
          <Markdown text={m.body} />
        </div>
      ))}
    </Card>
  );
}
