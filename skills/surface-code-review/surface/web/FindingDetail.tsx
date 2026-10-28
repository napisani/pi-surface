// One finding in full: the agent's account, the code, and what the user
// makes of it: comments, change requests, questions.
import { anchorOf, type CodeRef as CodeRefValue } from "../../../../src/kit/code.ts";
import type { Finding } from "../../../../src/kit/findings.ts";
import { ChatThread } from "../../../../web/kit/ChatThread.tsx";
import { CodeRef } from "../../../../web/kit/CodeRef.tsx";
import { FindingFacts } from "../../../../web/kit/FindingFacts.tsx";
import { AskRow } from "../../../../web/kit/primitives/AskRow.tsx";
import { Button } from "../../../../web/kit/primitives/Button.tsx";
import { Note } from "../../../../web/kit/primitives/Note.tsx";
import { Row } from "../../../../web/kit/primitives/Row.tsx";
import { usePending } from "../../../../web/kit/store.ts";
import { Visuals } from "../../../../web/kit/Visuals.tsx";
import type { ReviewState } from "../state.ts";
import { CommentCard } from "./CommentCard.tsx";
import { useGithub, useLive, useMode, usePost, useReview } from "./hooks.ts";
import { sideRev } from "./lineItems.ts";
import { useNav } from "./nav.ts";
import { RequestCard } from "./RequestCard.tsx";

const selectFiles = (s: ReviewState) => s.files;
const selectComments = (s: ReviewState) => s.comments;
const selectRequests = (s: ReviewState) => s.requests;

function RefBlock({ codeRef, role }: { codeRef: CodeRefValue; role: string }) {
  const nav = useNav();
  const mode = useMode();
  const inPr = useReview(selectFiles).some((f) => f.path === codeRef.path);
  const open = () => nav.jumpTo(anchorOf(codeRef));
  return <CodeRef codeRef={codeRef} role={role} outside={!inPr} diffRev={sideRev(mode, "RIGHT")} label={codeRef.rev === "base" ? "before" : ""} {...(inPr ? { onOpen: open } : {})} />;
}

export function FindingDetail({ finding: f }: { finding: Finding }) {
  const post = usePost();
  const nav = useNav();
  const live = useLive();
  const github = useGithub();
  const inPr = useReview(selectFiles).some((x) => x.path === f.primary.path);
  const drafts = useReview(selectComments).filter((c) => c.origin.kind === "finding" && c.origin.findingId === f.id);
  const requests = useReview(selectRequests).filter((r) => r.origin.kind === "finding" && r.origin.findingId === f.id);
  const requesting = usePending(`freq-${f.id}`);
  const drafting = usePending(`draft-${f.id}`);
  const autoDrafting = usePending(`auto-${f.id}`);
  const primary = f.primary;
  return (
    <>
      <FindingFacts
        finding={f}
        actions={
          <>
            {inPr ? <Button onClick={() => nav.jumpTo(anchorOf(primary))}>Show in diff</Button> : null}
            <Button onClick={() => void post({ type: "finding.dismiss", findingId: f.id, dismissed: !f.dismissed })}>{f.dismissed ? "Restore" : "Dismiss"}</Button>
          </>
        }
      />
      {f.visuals.length ? (
        <>
          <h3>See it</h3>
          <Visuals key={f.id} visuals={f.visuals} />
        </>
      ) : null}
      <h3>Code</h3>
      <RefBlock codeRef={f.primary} role="Where" />
      {f.related.map((r) => (
        <RefBlock key={`${r.path}:${r.rev}:${r.startLine}`} codeRef={r} role="Related" />
      ))}
      {live ? (
        <>
          <h3>Change requests</h3>
          {requests.map((r) => (
            <RequestCard key={r.id} request={r} location />
          ))}
          <Row>
            <Button disabled={requesting} onClick={() => void post({ type: "findings.request", findingIds: [f.id] }, `freq-${f.id}`)}>
              Request this fix
            </Button>
          </Row>
        </>
      ) : null}
      {github ? (
        <>
          <h3>Comments</h3>
          {drafts.map((c) => (
            <CommentCard key={c.id} comment={c} location />
          ))}
          {inPr ? (
            <Row>
              <Button disabled={drafting} onClick={() => void post({ type: "finding.draft", findingId: f.id }, `draft-${f.id}`)}>
                Start a draft from this finding
              </Button>
              <Button disabled={autoDrafting} onClick={() => void post({ type: "findings.autoComment", findingIds: [f.id] }, `auto-${f.id}`)}>
                ✦ Have the agent draft it
              </Button>
            </Row>
          ) : (
            <Note>This finding points at a file outside the diff. To comment, open the diff and click + on the closest changed line.</Note>
          )}
        </>
      ) : null}
      <h3>Ask about this finding</h3>
      <ChatThread messages={f.thread} />
      <AskRow key={f.id} placeholder="Ask the agent about this finding" pendingKey={`ask-${f.id}`} onSend={(text) => post({ type: "finding.ask", findingId: f.id, text }, `ask-${f.id}`)} />
    </>
  );
}
