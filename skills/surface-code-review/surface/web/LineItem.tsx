// What one diff annotation shows. Each looks its item up in the store, so a
// change to an item re-renders only its own annotation.
import type { CodeViewAnnotationArgs } from "@pierre/diffs/react";
import { useCallback, useMemo } from "react";
import type { LineItemRef } from "../../../../web/kit/diffItems.ts";
import { FindingChip } from "../../../../web/kit/FindingChip.tsx";
import { indexById } from "../../../../web/kit/indexById.ts";
import { useValue } from "../../../../web/kit/valueStore.ts";
import type { ReviewState } from "../state.ts";
import { CommentCard } from "./CommentCard.tsx";
import { ComposerCard } from "./ComposerCard.tsx";
import { useReview } from "./hooks.ts";
import { threads } from "./lineItems.ts";
import css from "./LineItem.module.css";
import { useNav } from "./nav.ts";
import { QuestionCard } from "./QuestionCard.tsx";
import { RemoteThread } from "./RemoteThread.tsx";
import { RequestCard } from "./RequestCard.tsx";
import { composerStore } from "./ui.ts";

const selectRemote = (s: ReviewState) => s.remote;

function ThreadItem({ id }: { id: number }) {
  const remote = useReview(selectRemote);
  const thread = useMemo(() => threads(remote).find((t) => t.root.id === id), [remote, id]);
  return thread ? <RemoteThread root={thread.root} replies={thread.replies} /> : null;
}

function CommentItem({ id }: { id: string }) {
  const comment = useReview(useCallback((s: ReviewState) => indexById(s.comments).get(id), [id]));
  return comment ? <CommentCard comment={comment} /> : null;
}

function ComposerItem() {
  const composer = useValue(composerStore);
  return composer ? <ComposerCard composer={composer} /> : null;
}

function FindingItem({ id }: { id: string }) {
  const nav = useNav();
  const finding = useReview(useCallback((s: ReviewState) => indexById(s.review.findings).get(id), [id]));
  return finding ? <FindingChip finding={finding} onOpen={() => nav.openFinding(id)} /> : null;
}

function QuestionItem({ id }: { id: string }) {
  const question = useReview(useCallback((s: ReviewState) => indexById(s.questions).get(id), [id]));
  return question ? <QuestionCard question={question} /> : null;
}

function RequestItem({ id }: { id: string }) {
  const request = useReview(useCallback((s: ReviewState) => indexById(s.requests).get(id), [id]));
  return request ? <RequestCard request={request} /> : null;
}

function Item({ item }: { item: LineItemRef }) {
  switch (item.kind) {
    case "thread":
      return <ThreadItem id={Number(item.id)} />;
    case "comment":
      return <CommentItem id={String(item.id)} />;
    case "composer":
      return <ComposerItem />;
    case "finding":
      return <FindingItem id={String(item.id)} />;
    case "question":
      return <QuestionItem id={String(item.id)} />;
    case "request":
      return <RequestItem id={String(item.id)} />;
  }
}

/** CodeView's renderAnnotation; module scope keeps it one function for the page's life. */
export function renderLineItem(...[annotation]: CodeViewAnnotationArgs<LineItemRef>) {
  return (
    <div className={css.annotation}>
      <Item item={annotation.metadata} />
    </div>
  );
}
