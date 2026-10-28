// A new item written at a diff line: a comment draft, a change request, or a
// question for the agent. It exists only on the page until one of them is sent.
import { useState } from "react";
import { AssistBox } from "../../../../web/kit/AssistBox.tsx";
import { Button } from "../../../../web/kit/primitives/Button.tsx";
import { Card } from "../../../../web/kit/primitives/Card.tsx";
import { CardHead } from "../../../../web/kit/primitives/CardHead.tsx";
import { CardId } from "../../../../web/kit/primitives/CardId.tsx";
import { Row } from "../../../../web/kit/primitives/Row.tsx";
import { Text } from "../../../../web/kit/primitives/Text.tsx";
import { usePending } from "../../../../web/kit/store.ts";
import { QUICK_ASKS } from "./CommentCard.tsx";
import { useGithub, useMode, usePost } from "./hooks.ts";
import { sideRev, where, type Composer } from "./lineItems.ts";
import { composerStore } from "./ui.ts";

function placeholderFor(live: boolean, github: boolean, reply: boolean): string {
  if (reply) {
    return "Write a reply.";
  }
  const parts = [live ? "Describe a change for the agent to make" : "", github ? "write a comment for the PR" : "", "ask the agent a question"].filter(Boolean);
  const text = parts.join(", or ");
  return `${text[0].toUpperCase()}${text.slice(1)}.`;
}

export function ComposerCard({ composer }: { composer: Composer }) {
  const post = usePost();
  const mode = useMode();
  const live = mode === "live";
  const github = useGithub();
  const busy = usePending("composer");
  const [text, setText] = useState("");
  const [assistOpen, setAssistOpen] = useState(false);
  const reply = composer.inReplyTo !== undefined;
  const close = () => composerStore.set(null);

  const create = async (then?: "post" | { assist: string }) => {
    if (!then && !text.trim()) {
      return;
    }
    if (await post({ type: "comment.create", anchor: composer.anchor, body: text, inReplyTo: composer.inReplyTo, then }, "composer")) {
      close();
    }
  };
  const request = async () => {
    if (text.trim() && (await post({ type: "request.create", anchor: composer.anchor, body: text.trim() }, "composer"))) {
      close();
    }
  };
  const ask = async () => {
    if (!text.trim()) {
      return;
    }
    const { path, side, line, startLine } = composer.anchor;
    if (await post({ type: "question.ask", ref: { path, rev: sideRev(mode, side), startLine: startLine ?? line, endLine: line }, text: text.trim() }, "composer")) {
      close();
    }
  };

  return (
    <Card accent="composer">
      <CardHead>
        <CardId tone="blue">new</CardId>
        <Text tone="faint">{reply ? "reply" : where(composer.anchor)}</Text>
      </CardHead>
      {/* oxlint-disable-next-line jsx-a11y/no-autofocus -- the user just clicked + to start writing here */}
      <textarea rows={4} placeholder={placeholderFor(live, github, reply)} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
      {assistOpen ? (
        <AssistBox asks={QUICK_ASKS} placeholder="Tell the agent what to write" onSend={(instruction) => void create({ assist: instruction })} onClose={() => setAssistOpen(false)} />
      ) : (
        <Row end>
          <Button kind="ghost" onClick={close}>
            Cancel
          </Button>
          {reply ? null : (
            <Button title="Only the agent sees this; nothing goes to GitHub" disabled={busy} onClick={() => void ask()}>
              Ask the agent
            </Button>
          )}
          {github ? (
            <>
              <Button onClick={() => setAssistOpen(true)}>✦ Draft with AI</Button>
              <Button disabled={busy} onClick={() => void create()}>
                Save draft
              </Button>
              <Button kind={live ? "plain" : "primary"} disabled={busy} onClick={() => void create("post")}>
                Post to GitHub
              </Button>
            </>
          ) : null}
          {live && !reply ? (
            <Button kind="primary" title="Queued until you send the batch" disabled={busy} onClick={() => void request()}>
              Request change
            </Button>
          ) : null}
        </Row>
      )}
    </Card>
  );
}
