// The Replies tab: every reply in one place, grouped by whether it can be posted.
import { Button } from "../../../../web/kit/primitives/Button.tsx";
import { EmptyState } from "../../../../web/kit/primitives/EmptyState.tsx";
import { TaskBar } from "../../../../web/kit/primitives/TaskBar.tsx";
import { usePending } from "../../../../web/kit/store.ts";
import { postBlocker, type FeedbackItem, type FeedbackState } from "../state.ts";
import { useFeedback, usePost } from "./hooks.ts";
import { ReplyCard } from "./ReplyCard.tsx";
import { stageOf } from "./stage.ts";

const selectState = (s: FeedbackState) => s;

function Group({ label, items }: { label: string; items: readonly FeedbackItem[] }) {
  if (!items.length) {
    return null;
  }
  return (
    <>
      <h3>
        {label} ({items.length})
      </h3>
      {items.map((i) => (
        <ReplyCard key={i.id} item={i} location />
      ))}
    </>
  );
}

export function RepliesTab() {
  const post = usePost();
  const state = useFeedback(selectState);
  const drafting = usePending("autodraft");
  const items = state.items.filter((i) => !i.hidden);
  const drafts = items.filter((i) => i.reply && i.reply.status !== "posted" && !i.reply.assisting);
  const toCopy = drafts.filter((i) => i.source.kind === "chat" || !state.pr);
  const ready = drafts.filter((i) => !toCopy.includes(i) && !postBlocker(state, i));
  const blocked = drafts.filter((i) => !toCopy.includes(i) && postBlocker(state, i));
  const writing = items.filter((i) => i.reply?.assisting);
  const posted = items.filter((i) => i.reply?.status === "posted");
  const missing = items.filter((i) => !i.reply && i.decision !== "undecided" && stageOf(i) !== "done" && i.fix?.status !== "sent" && i.fix?.status !== "pending");
  const postAll = async () => {
    if (!window.confirm(`Post ${ready.length} repl${ready.length === 1 ? "y" : "ies"} to GitHub now? GitHub notifies the PR's participants once per reply.`)) {
      return;
    }
    for (const i of ready) {
      // oxlint-disable-next-line no-await-in-loop -- one post at a time, so GitHub's notifications arrive in order
      await post({ type: "reply.post", itemId: i.id }, `reply-${i.id}`);
    }
  };
  return (
    <>
      <TaskBar title="Replies" sub="Every reply in one place. Nothing reaches GitHub until you click Post.">
        {missing.length ? (
          <Button disabled={drafting} onClick={() => void post({ type: "replies.autoDraft", itemIds: missing.map((i) => i.id) }, "autodraft")}>
            ✦ Draft the {missing.length} missing
          </Button>
        ) : null}
        <Button kind="primary" disabled={!ready.length} onClick={() => void postAll()}>
          Post all ready ({ready.length})
        </Button>
      </TaskBar>
      {!drafts.length && !writing.length && !posted.length ? <EmptyState small>No replies yet. Write one from an item, or draft the missing ones with the agent.</EmptyState> : null}
      <Group label="Being written" items={writing} />
      <Group label="Ready to post" items={ready} />
      <Group label="Not postable yet" items={blocked} />
      <Group label="To copy" items={toCopy} />
      <Group label="Posted" items={posted} />
    </>
  );
}
