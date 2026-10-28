// One feedback item in full, top to bottom in the order the user works it:
// what was said, the code, the agent's analysis, the decision, questions, the reply.
import { lines } from "../../../../web/kit/lines.ts";
import { Badge } from "../../../../web/kit/primitives/Badge.tsx";
import { Button } from "../../../../web/kit/primitives/Button.tsx";
import { Section } from "../../../../web/kit/primitives/Section.tsx";
import { Spacer } from "../../../../web/kit/primitives/Spacer.tsx";
import { Text } from "../../../../web/kit/primitives/Text.tsx";
import { usePending } from "../../../../web/kit/store.ts";
import type { FeedbackItem, FeedbackState } from "../state.ts";
import { AnalysisPane } from "./AnalysisPane.tsx";
import { CodePane } from "./CodePane.tsx";
import { DecisionPane } from "./DecisionPane.tsx";
import { DiscussionPane } from "./DiscussionPane.tsx";
import { useFeedback, usePost } from "./hooks.ts";
import css from "./ItemDetail.module.css";
import { KIND } from "./labels.ts";
import { ReplyCard } from "./ReplyCard.tsx";
import { SourcePane } from "./SourcePane.tsx";

const selectGithub = (s: FeedbackState) => s.pr !== null;

export function ItemDetail({ item }: { item: FeedbackItem }) {
  const post = usePost();
  const github = useFeedback(selectGithub);
  const resolving = usePending(`resolve-${item.id}`);
  const flag = (f: "hidden" | "closed", value: boolean) => void post({ type: "item.flag", itemId: item.id, flag: f, value });
  const source = item.source;
  const resolvable = source.kind === "thread" && !source.resolved && Boolean(source.threadId) && github;
  const a = item.anchor;
  return (
    <>
      <div className={css.head}>
        <span className={css.id}>{item.id}</span>
        <Badge>
          {KIND[source.kind].icon} {KIND[source.kind].label}
        </Badge>
        {source.kind === "review" ? <Badge>{source.state.toLowerCase().replace("_", " ")}</Badge> : null}
        {source.kind === "thread" && source.outdated ? <Badge>outdated</Badge> : null}
        {source.kind === "thread" && source.resolved ? <Badge tone="ok">resolved</Badge> : null}
        {a ? (
          <Text mono small>
            {a.path}
            {a.line ? `:${lines(a.startLine ?? a.line, a.line)}` : ""}
          </Text>
        ) : null}
        <Spacer />
        {item.url?.startsWith("https://") ? (
          <a href={item.url} target="_blank" rel="noreferrer">
            <Text tone="faint">open on GitHub ↗</Text>
          </a>
        ) : null}
        {resolvable ? (
          <Button size="small" title="Resolve this thread on GitHub now" disabled={resolving} onClick={() => void post({ type: "thread.resolve", itemId: item.id }, `resolve-${item.id}`)}>
            Resolve thread
          </Button>
        ) : null}
        <Button size="small" onClick={() => flag("closed", !item.closed)}>
          {item.closed ? "Reopen" : "Mark done"}
        </Button>
        <Button kind="ghost" size="small" onClick={() => flag("hidden", !item.hidden)}>
          {item.hidden ? "Show" : "Hide"}
        </Button>
      </div>
      <Section title={`What @${item.author} said`}>
        <SourcePane messages={item.messages} />
      </Section>
      <CodePane item={item} />
      <AnalysisPane item={item} />
      <DecisionPane item={item} />
      <DiscussionPane item={item} />
      <Section title="Your reply">
        <ReplyCard item={item} />
      </Section>
    </>
  );
}
