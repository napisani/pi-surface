import { useMemo } from "react";
import { Markdown } from "../../../../web/kit/Markdown.tsx";
import { Button } from "../../../../web/kit/primitives/Button.tsx";
import { Card } from "../../../../web/kit/primitives/Card.tsx";
import { CardHead } from "../../../../web/kit/primitives/CardHead.tsx";
import { Row } from "../../../../web/kit/primitives/Row.tsx";
import { Spacer } from "../../../../web/kit/primitives/Spacer.tsx";
import { Text } from "../../../../web/kit/primitives/Text.tsx";
import { useValue } from "../../../../web/kit/valueStore.ts";
import type { RemoteComment, ReviewState } from "../state.ts";
import { CommentCard } from "./CommentCard.tsx";
import { ComposerCard } from "./ComposerCard.tsx";
import { useReview } from "./hooks.ts";
import css from "./RemoteThread.module.css";
import { composerStore } from "./ui.ts";

const selectComments = (s: ReviewState) => s.comments;

function Message({ comment: c }: { comment: RemoteComment }) {
  return (
    <div className={css.msg}>
      <CardHead>
        <b>@{c.author}</b>
        <Text tone="faint">{c.createdAt.slice(0, 10)}</Text>
        <Spacer />
        <a href={c.url} target="_blank" rel="noreferrer">
          <Text tone="faint">↗</Text>
        </a>
      </CardHead>
      <Markdown text={c.body} />
    </div>
  );
}

/** A GitHub review thread, the user's unposted replies to it, and a reply composer. */
export function RemoteThread({ root, replies }: { root: RemoteComment; replies: readonly RemoteComment[] }) {
  const comments = useReview(selectComments);
  const composer = useValue(composerStore);
  const drafts = useMemo(() => {
    const ids = new Set([root.id, ...replies.map((r) => r.id)]);
    return comments.filter((c) => c.inReplyTo !== undefined && ids.has(c.inReplyTo) && c.status !== "posted");
  }, [comments, root.id, replies]);
  const reply = () => composerStore.set({ anchor: { path: root.path, side: root.side, line: root.line ?? root.originalLine ?? 1 }, inReplyTo: root.id });
  return (
    <Card accent="remote">
      <div className={css.tag}>on GitHub</div>
      <Message comment={root} />
      {replies.map((r) => (
        <Message key={r.id} comment={r} />
      ))}
      {drafts.map((d) => (
        <CommentCard key={d.id} comment={d} />
      ))}
      {composer?.inReplyTo === root.id ? (
        <ComposerCard composer={composer} />
      ) : (
        <Row end>
          <Button onClick={reply}>Reply</Button>
        </Row>
      )}
    </Card>
  );
}
