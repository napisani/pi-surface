// A change request: the user annotates the live working tree, sends a batch,
// and the agent's edits come back with a reply per request.
import { useState } from "react";
import { Badge, ROUND_TONE } from "../../../../web/kit/primitives/Badge.tsx";
import { Button } from "../../../../web/kit/primitives/Button.tsx";
import { Card } from "../../../../web/kit/primitives/Card.tsx";
import { CardHead } from "../../../../web/kit/primitives/CardHead.tsx";
import { CardId } from "../../../../web/kit/primitives/CardId.tsx";
import { LocationLink } from "../../../../web/kit/primitives/LocationLink.tsx";
import { Row } from "../../../../web/kit/primitives/Row.tsx";
import { Text } from "../../../../web/kit/primitives/Text.tsx";
import { ROUND_LABEL, RoundThread } from "../../../../web/kit/RoundThread.tsx";
import type { ChangeRequest, ReviewState } from "../state.ts";
import { usePost, useReview } from "./hooks.ts";
import { anchorMoved, where } from "./lineItems.ts";
import { useNav } from "./nav.ts";

const selectFiles = (s: ReviewState) => s.files;

/** Where a request applies: a link to its lines, or the whole change. */
function RequestPlace({ request: r }: { request: ChangeRequest }) {
  const nav = useNav();
  const anchor = r.anchor;
  return anchor ? <LocationLink onClick={() => nav.jumpTo(anchor)}>{where(anchor)}</LocationLink> : <Text tone="faint">whole change</Text>;
}

export function RequestCard({ request: r, location }: { request: ChangeRequest; location?: boolean }) {
  const post = usePost();
  const nav = useNav();
  const files = useReview(selectFiles);
  const [editingOpen, setEditing] = useState(false);
  const editing = editingOpen && r.status === "pending";
  const moved = anchorMoved(files, r);
  const accent = r.status === "needs-input" ? "attention" : "request";
  return (
    <Card accent={accent} muted={r.status === "done" || r.status === "declined"}>
      <CardHead>
        <CardId tone="teal">{r.id}</CardId>
        <Badge tone={ROUND_TONE[r.status]}>{ROUND_LABEL[r.status]}</Badge>
        {r.origin.kind === "finding" ? (
          <Badge tone="link" onClick={() => r.origin.kind === "finding" && nav.openFinding(r.origin.findingId)}>
            from {r.origin.findingId}
          </Badge>
        ) : null}
        {location ? <RequestPlace request={r} /> : null}
        {moved ? (
          <Text tone="faint" title="The file changed after this was written">
            lines may have moved
          </Text>
        ) : null}
      </CardHead>
      <RoundThread
        work={r}
        editing={editing}
        onSave={async (body) => {
          const ok = await post({ type: "request.edit", requestId: r.id, body }, r.id);
          if (ok) {
            setEditing(false);
          }
          return ok;
        }}
        onCancel={() => setEditing(false)}
        followKey={`rf-${r.id}`}
        onFollowUp={(text) => post({ type: "request.followUp", requestId: r.id, text }, `rf-${r.id}`)}
      />
      {r.status === "pending" && !editing ? (
        <Row end>
          {r.messages.length === 1 ? (
            <Button kind="ghost" size="small" onClick={() => void post({ type: "request.delete", requestId: r.id })}>
              Delete
            </Button>
          ) : null}
          <Button size="small" onClick={() => setEditing(true)}>
            Edit
          </Button>
        </Row>
      ) : null}
    </Card>
  );
}
