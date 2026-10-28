// The Comments tab: drafts, posted comments, questions, and GitHub's threads.
// Without a PR there is nothing to post, so it lists questions only.
import { useMemo } from "react";
import { Badge } from "../../../../web/kit/primitives/Badge.tsx";
import { Button } from "../../../../web/kit/primitives/Button.tsx";
import { EmptyState } from "../../../../web/kit/primitives/EmptyState.tsx";
import { LocationLink } from "../../../../web/kit/primitives/LocationLink.tsx";
import { TaskBar } from "../../../../web/kit/primitives/TaskBar.tsx";
import type { ReviewState } from "../state.ts";
import { CommentCard } from "./CommentCard.tsx";
import css from "./CommentsTab.module.css";
import { usePost, useReview } from "./hooks.ts";
import { threads } from "./lineItems.ts";
import { useNav } from "./nav.ts";
import { QuestionCard } from "./QuestionCard.tsx";
import { RemoteThread } from "./RemoteThread.tsx";

const selectQuestions = (s: ReviewState) => s.questions;
const selectComments = (s: ReviewState) => s.comments;
const selectRemote = (s: ReviewState) => s.remote;
const selectGithub = (s: ReviewState) => s.pr !== null;

function QuestionList() {
  const questions = useReview(selectQuestions);
  const sorted = useMemo(() => questions.toSorted((a, b) => Number(a.resolved) - Number(b.resolved)), [questions]);
  return (
    <>
      <h3>Questions for the agent ({questions.filter((q) => !q.resolved).length} open)</h3>
      {sorted.length ? sorted.map((q) => <QuestionCard key={q.id} question={q} location />) : <EmptyState small>No questions. Click + beside a line and choose Ask the agent.</EmptyState>}
    </>
  );
}

function GitHubComments() {
  const post = usePost();
  const nav = useNav();
  const comments = useReview(selectComments);
  const remote = useReview(selectRemote);
  const groups = useMemo(() => threads(remote), [remote]);
  const open = comments.filter((c) => c.status === "draft" || c.status === "failed");
  const ready = open.filter((c) => c.body.trim() && !c.assisting);
  const sent = comments.filter((c) => c.status === "posting" || c.status === "posted");
  const postAll = async () => {
    if (!window.confirm(`Post ${ready.length} comment${ready.length === 1 ? "" : "s"} to GitHub now? GitHub notifies the PR's participants once per comment.`)) {
      return;
    }
    for (const c of ready) {
      // oxlint-disable-next-line no-await-in-loop -- one post at a time, so GitHub's notifications arrive in order
      await post({ type: "comment.post", commentId: c.id }, c.id);
    }
  };
  return (
    <>
      <TaskBar title="Comments" sub="All your drafts and questions. Post sends one comment to GitHub immediately.">
        <Button kind="primary" disabled={!ready.length} onClick={() => void postAll()}>
          Post all drafts ({ready.length})
        </Button>
      </TaskBar>
      <div className={css.layout}>
        <div>
          <h3>Drafts ({open.length})</h3>
          {open.length ? open.map((c) => <CommentCard key={c.id} comment={c} location />) : <EmptyState small>No drafts yet. Write one from the diff or from a finding.</EmptyState>}
          {sent.length ? (
            <>
              <h3>Posted ({sent.length})</h3>
              {sent.map((c) => (
                <CommentCard key={c.id} comment={c} location />
              ))}
            </>
          ) : null}
          <QuestionList />
        </div>
        <div>
          <h3>On GitHub ({groups.length} threads)</h3>
          {groups.map(({ root, replies }) => (
            <div key={root.id} className={css.thread}>
              <LocationLink onClick={() => root.line !== null && nav.jumpTo({ path: root.path, side: root.side, line: root.line })}>
                {root.path}:{root.line ?? root.originalLine ?? "?"} {root.line === null ? <Badge>outdated</Badge> : null}
              </LocationLink>
              <RemoteThread root={root} replies={replies} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export function CommentsTab() {
  const github = useReview(selectGithub);
  if (github) {
    return <GitHubComments />;
  }
  return (
    <>
      <TaskBar title="Questions" sub="Everything you've asked the agent about this code." />
      <QuestionList />
    </>
  );
}
