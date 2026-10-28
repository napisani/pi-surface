import { useState } from "react";
import { DRAFT_LABEL, DraftCard } from "../../../../web/kit/DraftCard.tsx";
import { Badge, DRAFT_TONE } from "../../../../web/kit/primitives/Badge.tsx";
import { Button } from "../../../../web/kit/primitives/Button.tsx";
import { CardHead } from "../../../../web/kit/primitives/CardHead.tsx";
import { CardId } from "../../../../web/kit/primitives/CardId.tsx";
import { LocationLink } from "../../../../web/kit/primitives/LocationLink.tsx";
import { Spacer } from "../../../../web/kit/primitives/Spacer.tsx";
import { Text } from "../../../../web/kit/primitives/Text.tsx";
import { usePending } from "../../../../web/kit/store.ts";
import type { DraftComment } from "../state.ts";
import { usePost } from "./hooks.ts";
import { where } from "./lineItems.ts";
import { useNav } from "./nav.ts";

export const QUICK_ASKS = ["Tighten it", "Add a suggestion block", "Explain the impact", "Make it a question", "Soften the tone"];

/** A draft review comment: edit it, have the agent revise it, post it. */
export function CommentCard({ comment: c, location }: { comment: DraftComment; location?: boolean }) {
  const post = usePost();
  const nav = useNav();
  const [editing, setEditing] = useState(false);
  const [assistOpen, setAssistOpen] = useState(false);
  const busy = usePending(c.id) || c.status === "posting";
  const head = (
    <CardHead>
      <CardId tone="amber">{c.id}</CardId>
      <Badge tone={DRAFT_TONE[c.status]}>{DRAFT_LABEL[c.status]}</Badge>
      {c.origin.kind === "finding" ? (
        <Badge tone="link" onClick={() => c.origin.kind === "finding" && nav.openFinding(c.origin.findingId)}>
          from {c.origin.findingId}
        </Badge>
      ) : null}
      {location ? <LocationLink onClick={() => nav.jumpTo(c.anchor)}>{where(c.anchor)}</LocationLink> : null}
      {c.inReplyTo ? <Text tone="faint">reply</Text> : null}
      <Spacer />
      {c.url ? (
        <a href={c.url} target="_blank" rel="noreferrer">
          <Text tone="faint">open on GitHub ↗</Text>
        </a>
      ) : null}
    </CardHead>
  );
  return (
    <DraftCard
      kind="draft"
      head={head}
      draft={c}
      busy={busy}
      editing={editing}
      assistOpen={assistOpen}
      asks={QUICK_ASKS}
      onEdit={setEditing}
      onSave={(body) => post({ type: "comment.edit", commentId: c.id, body }, c.id)}
      onAssistOpen={setAssistOpen}
      onAssist={async (instruction) => {
        if (await post({ type: "comment.assist", commentId: c.id, instruction }, c.id)) {
          setAssistOpen(false);
        }
      }}
      onStopAssist={() => void post({ type: "comment.stopAssist", commentId: c.id })}
      onDelete={() => void post({ type: "comment.delete", commentId: c.id })}
      errorPrefix="GitHub refused"
      actions={
        <Button kind="primary" disabled={busy || !c.body.trim()} onClick={() => void post({ type: "comment.post", commentId: c.id }, c.id)}>
          Post to GitHub
        </Button>
      }
    />
  );
}
