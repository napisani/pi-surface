// A commit the agent proposed: the user edits it, leaves files out, and commits it.
import { useState } from "react";
import type { CommitPlan, CommitStatus } from "../../src/kit/commits.ts";
import css from "./CommitPlanCard.module.css";
import { Badge, type Tone } from "./primitives/Badge.tsx";
import { Button } from "./primitives/Button.tsx";
import { Card, type Accent } from "./primitives/Card.tsx";
import { CardHead } from "./primitives/CardHead.tsx";
import { CardId } from "./primitives/CardId.tsx";
import { Row } from "./primitives/Row.tsx";
import { Spacer } from "./primitives/Spacer.tsx";
import { Text } from "./primitives/Text.tsx";
import { usePending } from "./store.ts";

const STATUS_TONE = { proposed: "neutral", committing: "info", committed: "ok", failed: "err" } satisfies Record<CommitStatus, Tone>;

const ACCENT = { proposed: "commit", committing: "commit", committed: "committed", failed: "failed" } satisfies Record<CommitStatus, Accent>;

export interface CommitPlanCardProps {
  plan: CommitPlan;
  onEdit(change: { message?: string; paths?: string[] }): Promise<boolean>;
  onDelete(): void;
  onCommit(): void;
  /** Opens one of the items the commit settles. */
  onOpenItem(id: string): void;
}

export function CommitPlanCard({ plan, onEdit, onDelete, onCommit, onOpenItem }: CommitPlanCardProps) {
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState(plan.message);
  const committing = usePending(`commit-${plan.id}`);
  const open = plan.status === "proposed" || plan.status === "failed";
  const accent = ACCENT[plan.status];
  return (
    <Card accent={accent}>
      <CardHead>
        <CardId tone="blue">{plan.id}</CardId>
        <Badge tone={STATUS_TONE[plan.status]}>{plan.status === "committing" ? "committing…" : plan.status}</Badge>
        {plan.sha ? <span className={css.sha}>{plan.sha.slice(0, 8)}</span> : null}
        {plan.status === "committed" ? <Badge tone={plan.pushed ? "ok" : "warn"}>{plan.pushed ? "on GitHub" : "not pushed"}</Badge> : null}
        <Spacer />
        {plan.items.map((id) => (
          <Badge key={id} mini onClick={() => onOpenItem(id)}>
            {id}
          </Badge>
        ))}
      </CardHead>
      {editing && open ? (
        <>
          <textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
          <Row end>
            <Button onClick={() => setEditing(false)}>Cancel</Button>
            <Button kind="primary" onClick={async () => (await onEdit({ message })) && setEditing(false)}>
              Save
            </Button>
          </Row>
        </>
      ) : (
        <pre className={css.message}>{plan.message}</pre>
      )}
      <div className={css.paths}>
        {plan.paths.map((p) => (
          <span key={p} className={css.path}>
            {p}
            {open && plan.paths.length > 1 ? (
              <button type="button" className={css.drop} title="Leave this file out" onClick={() => void onEdit({ paths: plan.paths.filter((x) => x !== p) })}>
                ×
              </button>
            ) : null}
          </span>
        ))}
      </div>
      {plan.error ? <Text tone="err">git refused: {plan.error}</Text> : null}
      {open && !editing ? (
        <Row end>
          <Button kind="ghost" onClick={onDelete}>
            Delete
          </Button>
          <Button
            onClick={() => {
              setMessage(plan.message);
              setEditing(true);
            }}
          >
            Edit message
          </Button>
          <Button kind="primary" title="Runs git commit with only these paths" disabled={committing} onClick={onCommit}>
            Commit
          </Button>
        </Row>
      ) : null}
    </Card>
  );
}
