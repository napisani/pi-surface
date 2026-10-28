// Approving a final draft, or asking for changes, is the user's verdict the agent waits on.
import { useRef, useState } from "react";
import { Button } from "../../../../web/kit/primitives/Button.tsx";
import { Row } from "../../../../web/kit/primitives/Row.tsx";
import { usePending } from "../../../../web/kit/store.ts";
import { DRAFT_NAMES, type Draft, type DraftKind } from "../state.ts";
import css from "./ApprovalBar.module.css";
import { ForgeBanner } from "./ForgeBanner.tsx";
import { usePost } from "./hooks.ts";

type Verdict = "approve" | "approveWithRfc" | "changes";

export function ApprovalBar({ kind, draft, rfcRequested }: { kind: DraftKind; draft: Draft; rfcRequested: boolean }) {
  const post = usePost();
  const key = `review:${kind}`;
  const busy = usePending(key);
  const [note, setNote] = useState("");
  const input = useRef<HTMLInputElement>(null);
  if (!draft.final || draft.writing) {
    return null;
  }
  const name = DRAFT_NAMES[kind];
  const path = draft.path ? <span className={css.mono}>{draft.path}</span> : null;
  if (draft.review?.verdict === "approved") {
    return (
      <ForgeBanner>
        <span>
          You approved the {name}
          {path ? <> · {path}</> : null}.
        </span>
      </ForgeBanner>
    );
  }
  if (draft.review?.verdict === "changes") {
    return (
      <ForgeBanner tone="blue">
        <span>
          You asked for changes: {draft.review.note}. The agent is revising the {name}.
        </span>
      </ForgeBanner>
    );
  }
  const review = async (verdict: Verdict) => {
    if (verdict === "changes" && !note.trim()) {
      input.current?.focus();
      return;
    }
    if (await post({ type: "draft.review", kind, verdict, note: verdict === "changes" ? note : undefined }, key)) {
      setNote("");
    }
  };
  return (
    <div className={css.bar}>
      <span>
        The agent finished the {name}
        {path ? <> at {path}</> : null}. Approve it, or say what to change.
      </span>
      <Row>
        <input ref={input} className={css.note} placeholder="What to change…" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void review("changes")} />
        <Button disabled={busy} onClick={() => void review("changes")}>
          Request changes
        </Button>
        {kind === "spec" && !rfcRequested ? (
          <Button disabled={busy} onClick={() => void review("approveWithRfc")}>
            Approve and write an RFC
          </Button>
        ) : null}
        <Button kind="primary" disabled={busy} onClick={() => void review("approve")}>
          Approve
        </Button>
      </Row>
    </div>
  );
}
