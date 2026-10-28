// A question thread: the user asks the agent about lines, a walkthrough step or the whole change.
import { anchorOf } from "../../../../src/kit/code.ts";
import { awaitingAgent } from "../../../../src/kit/thread.ts";
import { lines } from "../../../../web/kit/lines.ts";
import { MessageRows } from "../../../../web/kit/MessageRows.tsx";
import { AskRow } from "../../../../web/kit/primitives/AskRow.tsx";
import { Badge } from "../../../../web/kit/primitives/Badge.tsx";
import { Button } from "../../../../web/kit/primitives/Button.tsx";
import { Card } from "../../../../web/kit/primitives/Card.tsx";
import { CardHead } from "../../../../web/kit/primitives/CardHead.tsx";
import { CardId } from "../../../../web/kit/primitives/CardId.tsx";
import { LocationLink } from "../../../../web/kit/primitives/LocationLink.tsx";
import { Row } from "../../../../web/kit/primitives/Row.tsx";
import { Spacer } from "../../../../web/kit/primitives/Spacer.tsx";
import { Text } from "../../../../web/kit/primitives/Text.tsx";
import { Working } from "../../../../web/kit/primitives/Working.tsx";
import { usePending } from "../../../../web/kit/store.ts";
import { Visuals } from "../../../../web/kit/Visuals.tsx";
import type { QuestionThread, ReviewState } from "../state.ts";
import { useGithub, useLive, usePost, useReview } from "./hooks.ts";
import { useNav } from "./nav.ts";

const selectFiles = (s: ReviewState) => s.files;

const refLabel = (q: QuestionThread) => (q.ref ? `${q.ref.path}:${lines(q.ref.startLine, q.ref.endLine)}${q.ref.rev === "base" ? " (old)" : ""}` : "the whole PR");

export function QuestionCard({ question: q, location }: { question: QuestionThread; location?: boolean }) {
  const post = usePost();
  const nav = useNav();
  const live = useLive();
  const github = useGithub();
  const files = useReview(selectFiles);
  const requesting = usePending(`qreq-${q.id}`);
  const drafting = usePending(`qdraft-${q.id}`);
  const waiting = awaitingAgent(q.messages);
  const inPr = Boolean(q.ref) && files.some((f) => f.path === q.ref!.path);
  const anchor = q.ref ? anchorOf(q.ref) : undefined;
  const requestFromIt = () => {
    const answer = q.messages.findLast((m) => m.role === "agent")?.text ?? "";
    void post({ type: "request.create", anchor, body: `Apply what we worked out in ${q.id}: ${answer}` }, `qreq-${q.id}`);
  };
  const draftFromIt = () => {
    if (!anchor) {
      return;
    }
    const thread = q.messages.map((m) => `${m.role === "user" ? "Q" : "A"}: ${m.text}`).join("\n");
    void post({ type: "comment.create", anchor, body: "", then: { assist: `Write a review comment from this exchange:\n${thread}` } }, `qdraft-${q.id}`);
  };
  return (
    <Card accent="question" faded={q.resolved}>
      <CardHead>
        <CardId tone="violet">{q.id}</CardId>
        <Badge tone="violet">question</Badge>
        {location && anchor ? <LocationLink onClick={() => nav.jumpTo(anchor)}>{refLabel(q)}</LocationLink> : null}
        {q.stepTitle ? <Text tone="faint">step: {q.stepTitle}</Text> : null}
        <Spacer />
        <Button kind="ghost" size="small" onClick={() => void post({ type: "question.resolve", questionId: q.id, resolved: !q.resolved })}>
          {q.resolved ? "Reopen" : "Resolve"}
        </Button>
      </CardHead>
      <MessageRows messages={q.messages} />
      {waiting ? <Working>The agent is looking into it…</Working> : null}
      <Visuals visuals={q.visuals} />
      {q.resolved ? null : (
        <>
          <AskRow placeholder="Ask a follow-up…" pendingKey={`q-${q.id}`} onSend={(text) => post({ type: "question.followUp", questionId: q.id, text }, `q-${q.id}`)} />
          {inPr && !waiting && (live || github) ? (
            <Row end>
              {live ? (
                <Button size="small" title="Adds a request you can edit before sending" disabled={requesting} onClick={requestFromIt}>
                  Turn the answer into a change request
                </Button>
              ) : null}
              {github ? (
                <Button size="small" disabled={drafting} onClick={draftFromIt}>
                  ✦ Turn the answer into a comment draft
                </Button>
              ) : null}
            </Row>
          ) : null}
        </>
      )}
    </Card>
  );
}
