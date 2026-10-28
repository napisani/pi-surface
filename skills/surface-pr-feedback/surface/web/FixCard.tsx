import { useState } from "react";
import { Badge, ROUND_TONE } from "../../../../web/kit/primitives/Badge.tsx";
import { Button } from "../../../../web/kit/primitives/Button.tsx";
import { Card } from "../../../../web/kit/primitives/Card.tsx";
import { CardHead } from "../../../../web/kit/primitives/CardHead.tsx";
import { CardId } from "../../../../web/kit/primitives/CardId.tsx";
import { Row } from "../../../../web/kit/primitives/Row.tsx";
import { Spacer } from "../../../../web/kit/primitives/Spacer.tsx";
import { Text } from "../../../../web/kit/primitives/Text.tsx";
import { ROUND_LABEL, RoundThread } from "../../../../web/kit/RoundThread.tsx";
import type { Fix } from "../state.ts";
import { usePost } from "./hooks.ts";

/** The fix queued for an item: its instruction, the agent's outcome, and follow-ups. */
export function FixCard({ itemId, fix }: { itemId: string; fix: Fix }) {
  const post = usePost();
  const [editingOpen, setEditing] = useState(false);
  const editing = editingOpen && fix.status === "pending";
  const key = `fix-${itemId}`;
  return (
    <Card accent={fix.status === "needs-input" ? "attention" : "fix"}>
      <CardHead>
        <CardId tone="teal">fix</CardId>
        <Badge tone={ROUND_TONE[fix.status]}>{ROUND_LABEL[fix.status]}</Badge>
        {fix.round ? <Text tone="faint">round {fix.round}</Text> : null}
        {fix.files.length ? (
          <Text tone="faint" mono small>
            {fix.files.join(", ")}
          </Text>
        ) : null}
      </CardHead>
      <RoundThread
        work={fix}
        editing={editing}
        onSave={async (text) => {
          const ok = await post({ type: "fix.edit", itemId, text }, key);
          if (ok) {
            setEditing(false);
          }
          return ok;
        }}
        onCancel={() => setEditing(false)}
        followKey={key}
        onFollowUp={(text) => post({ type: "fix.followUp", itemId, text }, key)}
      />
      {fix.status === "pending" && !editing ? (
        <Row end>
          <Text tone="faint" small>
            Waits for Send fixes in the header.
          </Text>
          <Spacer />
          <Button size="small" onClick={() => setEditing(true)}>
            Edit
          </Button>
        </Row>
      ) : null}
    </Card>
  );
}
