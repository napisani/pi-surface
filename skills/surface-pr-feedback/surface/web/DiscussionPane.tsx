import { ChatThread } from "../../../../web/kit/ChatThread.tsx";
import { AskRow } from "../../../../web/kit/primitives/AskRow.tsx";
import { Section } from "../../../../web/kit/primitives/Section.tsx";
import { Visuals } from "../../../../web/kit/Visuals.tsx";
import type { FeedbackItem } from "../state.ts";
import { usePost } from "./hooks.ts";

/** Questions to the agent about an item, before deciding. The newest visual opens first. */
export function DiscussionPane({ item }: { item: FeedbackItem }) {
  const post = usePost();
  return (
    <Section title="Ask the agent">
      {item.discussion.length ? <ChatThread messages={item.discussion} waiting="The agent is reading the code…" /> : null}
      <Visuals key={`${item.id}:${item.discussionVisuals.length}`} visuals={item.discussionVisuals} initial={item.discussionVisuals.length - 1} />
      <AskRow
        placeholder={item.discussion.length ? "Follow up…" : "What does this mean? Is the reviewer right? What breaks if I skip it?"}
        pendingKey={`ask-${item.id}`}
        onSend={(text) => post({ type: "item.ask", itemId: item.id, text }, `ask-${item.id}`)}
      />
    </Section>
  );
}
