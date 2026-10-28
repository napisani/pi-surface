// A GitHub draft (review comment, reply): write it by hand, have the agent
// draft or revise it, then post it, which only the user's click does.
import { useState, type ReactNode } from "react";
import type { DraftStatus, GitHubDraft } from "../../src/kit/github-draft.ts";
import { AssistBox } from "./AssistBox.tsx";
import { Markdown } from "./Markdown.tsx";
import { Button } from "./primitives/Button.tsx";
import { Card, type Accent } from "./primitives/Card.tsx";
import { Note } from "./primitives/Note.tsx";
import { Row } from "./primitives/Row.tsx";
import { Spacer } from "./primitives/Spacer.tsx";
import { Text } from "./primitives/Text.tsx";
import { Working } from "./primitives/Working.tsx";

export const DRAFT_LABEL = { draft: "draft", posting: "posting…", posted: "posted", failed: "failed" } satisfies Record<DraftStatus, string>;

export interface DraftCardProps {
  /** "draft" for review comments, "reply" for feedback replies. */
  kind: "draft" | "reply";
  head: ReactNode;
  draft: GitHubDraft;
  busy: boolean;
  editing: boolean;
  assistOpen: boolean;
  asks: readonly string[];
  placeholder?: string;
  onEdit(open: boolean): void;
  onSave(body: string): Promise<boolean>;
  onAssistOpen(open: boolean): void;
  onAssist(instruction: string): void;
  onStopAssist(): void;
  onDelete(): void;
  /** Extra lines under the body: what it posts as, the commit it names. */
  extra?: ReactNode;
  /** Prefix for the error line, e.g. "GitHub refused". */
  errorPrefix?: string;
  /** Post buttons and anything else that sits after Edit and AI revise. */
  actions?: ReactNode;
  /** Shown before the buttons, e.g. why posting is blocked. */
  hint?: string;
}

function EditBody({ body, placeholder, busy, onSave, onEdit }: { body: string; placeholder?: string; busy: boolean; onSave(body: string): Promise<boolean>; onEdit(open: boolean): void }) {
  const [value, setValue] = useState(body);
  return (
    <>
      <textarea rows={5} placeholder={placeholder} value={value} onChange={(e) => setValue(e.target.value)} />
      <Row end>
        <Button onClick={() => onEdit(false)}>Cancel</Button>
        <Button kind="primary" disabled={busy} onClick={async () => (await onSave(value)) && onEdit(false)}>
          Save
        </Button>
      </Row>
    </>
  );
}

export function DraftCard(o: DraftCardProps) {
  const d = o.draft;
  const posted = d.status === "posted";
  if (d.assisting) {
    return (
      <Card accent="assisting">
        {o.head}
        <Working>The agent is writing this…</Working>
        {d.body ? <Markdown text={d.body} /> : null}
        <Row end>
          <Button onClick={o.onStopAssist}>Stop waiting</Button>
        </Row>
      </Card>
    );
  }
  if (o.editing && !posted) {
    return (
      <Card accent={o.kind}>
        {o.head}
        <EditBody body={d.body} placeholder={o.placeholder} busy={o.busy} onSave={o.onSave} onEdit={o.onEdit} />
      </Card>
    );
  }
  const accent: Accent = posted ? "posted" : o.kind;
  return (
    <Card accent={accent}>
      {o.head}
      {d.body ? <Markdown text={d.body} /> : <Text tone="faint">Empty draft.</Text>}
      {o.extra}
      {d.agentNote ? <Note>Agent: {d.agentNote}</Note> : null}
      {d.error ? <Text tone="err">{posted || !o.errorPrefix ? d.error : `${o.errorPrefix}: ${d.error}`}</Text> : null}
      {posted ? null : <DraftActions {...o} />}
    </Card>
  );
}

/** Under an unposted draft: the revise box while it is open, otherwise the buttons. */
function DraftActions(o: DraftCardProps) {
  if (o.assistOpen) {
    return <AssistBox asks={o.asks} placeholder="Tell the agent what to change" onSend={o.onAssist} onClose={() => o.onAssistOpen(false)} />;
  }
  return (
    <Row end>
      {o.hint ? (
        <>
          <Text tone="faint" small>
            {o.hint}
          </Text>
          <Spacer />
        </>
      ) : null}
      <Button kind="ghost" disabled={o.busy} onClick={o.onDelete}>
        Delete
      </Button>
      <Button disabled={o.busy} onClick={() => o.onEdit(true)}>
        Edit
      </Button>
      <Button disabled={o.busy} onClick={() => o.onAssistOpen(true)}>
        ✦ AI revise
      </Button>
      {o.actions}
    </Row>
  );
}
