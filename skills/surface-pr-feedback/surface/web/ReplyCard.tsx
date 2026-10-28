// A reply to a feedback item: write it by hand or have the agent draft it,
// then post it (only on the user's click) or copy it.
import { useState, type ReactNode } from "react";
import { AssistBox } from "../../../../web/kit/AssistBox.tsx";
import { DRAFT_LABEL, DraftCard } from "../../../../web/kit/DraftCard.tsx";
import { Badge, DRAFT_TONE } from "../../../../web/kit/primitives/Badge.tsx";
import { Button } from "../../../../web/kit/primitives/Button.tsx";
import { Card } from "../../../../web/kit/primitives/Card.tsx";
import { CardHead } from "../../../../web/kit/primitives/CardHead.tsx";
import { CardId } from "../../../../web/kit/primitives/CardId.tsx";
import { LocationLink } from "../../../../web/kit/primitives/LocationLink.tsx";
import { Note } from "../../../../web/kit/primitives/Note.tsx";
import { Row } from "../../../../web/kit/primitives/Row.tsx";
import { Spacer } from "../../../../web/kit/primitives/Spacer.tsx";
import { Text } from "../../../../web/kit/primitives/Text.tsx";
import { usePending } from "../../../../web/kit/store.ts";
import { copyText } from "../../../../web/kit/toast.ts";
import { commitFor, postBlocker, postedBody, type FeedbackItem, type FeedbackState } from "../state.ts";
import { useFeedback, usePost } from "./hooks.ts";
import { openItem } from "./nav.ts";
import css from "./ReplyCard.module.css";

const QUICK_ASKS = ["Tighten it", "Name the commit", "Explain why not", "Disagree plainly", "Make it friendlier"];
const FIRST_ASKS = ["Draft a reply", "Say it's fixed, name the commit", "Explain why not"];
const PLACEHOLDER = "One or two lines: what changed and where, or why nothing did.";

const selectState = (s: FeedbackState) => s;

function CommitLine({ item }: { item: FeedbackItem }) {
  const commit = commitFor(useFeedback(selectState), item.id);
  if (!commit) {
    return null;
  }
  return (
    <Note>
      Fixed in <span className={css.sha}>{commit.sha?.slice(0, 8)}</span> · {commit.message.split("\n")[0]} · {commit.pushed ? <Text tone="ok">on GitHub</Text> : <Text tone="warn">not pushed</Text>}
    </Note>
  );
}

function FirstReply({ item, head, onWrite }: { item: FeedbackItem; head: ReactNode; onWrite(): void }) {
  const post = usePost();
  const [assistOpen, setAssistOpen] = useState(false);
  const assist = async (instruction: string) => {
    if (await post({ type: "reply.assist", itemId: item.id, instruction }, `reply-${item.id}`)) {
      setAssistOpen(false);
    }
  };
  return (
    <Card accent="empty">
      {head}
      {assistOpen ? (
        <AssistBox asks={FIRST_ASKS} placeholder="Tell the agent what the reply should say" onSend={(i) => void assist(i)} onClose={() => setAssistOpen(false)} />
      ) : (
        <Row>
          <Text tone="faint">No reply yet.</Text>
          <Spacer />
          <Button onClick={onWrite}>Write reply</Button>
          <Button kind="primary" onClick={() => setAssistOpen(true)}>
            ✦ Draft with AI
          </Button>
        </Row>
      )}
    </Card>
  );
}

function NewReply({ item, head, onClose }: { item: FeedbackItem; head: ReactNode; onClose(): void }) {
  const post = usePost();
  const key = `reply-${item.id}`;
  const busy = usePending(key);
  const [body, setBody] = useState("");
  return (
    <Card accent="reply">
      {head}
      <textarea rows={4} placeholder={PLACEHOLDER} value={body} onChange={(e) => setBody(e.target.value)} />
      <Row end>
        <Button onClick={onClose}>Cancel</Button>
        <Button kind="primary" disabled={busy} onClick={async () => (await post({ type: "reply.edit", itemId: item.id, body }, key)) && onClose()}>
          Save draft
        </Button>
      </Row>
    </Card>
  );
}

export function ReplyCard({ item, location }: { item: FeedbackItem; location?: boolean }) {
  const post = usePost();
  // postBlocker reads the PR and the commits as well as the item, so the card follows the whole state.
  const state = useFeedback(selectState);
  const pr = state.pr;
  const [editing, setEditing] = useState(false);
  const [assistOpen, setAssistOpen] = useState(false);
  const reply = item.reply;
  const key = `reply-${item.id}`;
  const busy = usePending(key) || reply?.status === "posting";
  const chat = item.source.kind === "chat";
  const head = <ReplyHead item={item} location={location} />;
  if (!reply) {
    return editing ? <NewReply item={item} head={head} onClose={() => setEditing(false)} /> : <FirstReply item={item} head={head} onWrite={() => setEditing(true)} />;
  }

  const blocker = postBlocker(state, item);
  const quoted = pr && !chat && (item.source.kind === "review" || item.source.kind === "conversation");
  return (
    <DraftCard
      kind="reply"
      head={head}
      draft={reply}
      busy={busy}
      editing={editing}
      assistOpen={assistOpen}
      asks={QUICK_ASKS}
      placeholder={PLACEHOLDER}
      onEdit={setEditing}
      onSave={(body) => post({ type: "reply.edit", itemId: item.id, body }, key)}
      onAssistOpen={setAssistOpen}
      onAssist={async (instruction) => {
        if (await post({ type: "reply.assist", itemId: item.id, instruction }, key)) {
          setAssistOpen(false);
        }
      }}
      onStopAssist={() => void post({ type: "reply.stopAssist", itemId: item.id })}
      onDelete={() => void post({ type: "reply.delete", itemId: item.id })}
      errorPrefix="GitHub refused"
      hint={blocker && !chat && reply.body.trim() ? blocker : undefined}
      extra={
        <>
          {quoted && reply.status !== "posted" ? (
            <details className={css.postsAs}>
              <summary>Posts as a PR comment quoting the original</summary>
              <pre>{postedBody(item, reply.body)}</pre>
            </details>
          ) : null}
          <CommitLine item={item} />
        </>
      }
      actions={<ReplyActions item={item} body={reply.body} github={Boolean(pr) && !chat} blocker={blocker} busy={busy} />}
    />
  );
}

function ReplyHead({ item, location }: { item: FeedbackItem; location?: boolean }) {
  const reply = item.reply;
  return (
    <CardHead>
      <CardId tone="amber">reply</CardId>
      {location ? (
        <LocationLink onClick={() => openItem(item.id)}>
          {item.id} · @{item.author}
        </LocationLink>
      ) : null}
      {reply ? <Badge tone={DRAFT_TONE[reply.status]}>{DRAFT_LABEL[reply.status]}</Badge> : null}
      {item.source.kind === "chat" ? <Text tone="faint">from chat: copy it to the reviewer</Text> : null}
      <Spacer />
      {reply?.url ? (
        <a href={reply.url} target="_blank" rel="noreferrer">
          <Text tone="faint">open on GitHub ↗</Text>
        </a>
      ) : null}
    </CardHead>
  );
}

/** Copy, and when the reply goes to GitHub, the post buttons; posting stays disabled while something blocks it. */
function ReplyActions({ item, body, github, blocker, busy }: { item: FeedbackItem; body: string; github: boolean; blocker: string | undefined; busy: boolean }) {
  const post = usePost();
  const send = (resolve: boolean) => void post({ type: "reply.post", itemId: item.id, resolve }, `reply-${item.id}`);
  const resolvable = item.source.kind === "thread" && !item.source.resolved && Boolean(item.source.threadId);
  const blocked = busy || Boolean(blocker);
  return (
    <>
      <Button onClick={() => void copyText(github ? postedBody(item, body) : body)}>Copy</Button>
      {github && resolvable ? (
        <Button title={blocker ?? "Post the reply, then resolve the thread"} disabled={blocked} onClick={() => send(true)}>
          Post &amp; resolve
        </Button>
      ) : null}
      {github ? (
        <Button kind="primary" title={blocker ?? "Post this reply to GitHub now"} disabled={blocked} onClick={() => send(false)}>
          Post to GitHub
        </Button>
      ) : null}
    </>
  );
}
