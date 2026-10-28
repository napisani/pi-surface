// The spec or RFC draft: ask the agent to write it, see what changed since,
// read it with its outline and TBDs, and approve the final one.
import { useMemo } from "react";
import { useStoredState } from "../../../../web/kit/hooks/useStoredState.ts";
import { Button } from "../../../../web/kit/primitives/Button.tsx";
import { EmptyState } from "../../../../web/kit/primitives/EmptyState.tsx";
import { Panel } from "../../../../web/kit/primitives/Panel.tsx";
import { Segmented } from "../../../../web/kit/primitives/Segmented.tsx";
import { usePending } from "../../../../web/kit/store.ts";
import { copyText } from "../../../../web/kit/toast.ts";
import { decisionBasis, DRAFT_NAMES, type Draft, type DraftKind, type ForgeState } from "../state.ts";
import { ApprovalBar } from "./ApprovalBar.tsx";
import { DraftDoc } from "./DraftDoc.tsx";
import css from "./DraftPanel.module.css";
import { DraftSide } from "./DraftSide.tsx";
import { ForgeBanner } from "./ForgeBanner.tsx";
import { useForge, usePost } from "./hooks.ts";
import { IdChips } from "./IdChips.tsx";
import { parseDraft } from "../draft.ts";

const KINDS = [
  { id: "spec", label: "Tech spec" },
  { id: "rfc", label: "RFC" },
] as const;

const selectState = (s: ForgeState) => s;

function writtenLine(draft: Draft, tbds: number): string {
  const decisions = Object.keys(draft.basis).length;
  const at = new Date(draft.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `Written ${at} from ${decisions} decision${decisions === 1 ? "" : "s"} · ${tbds} TBD${tbds === 1 ? "" : "s"}`;
}

function requestLabel(draft: Draft | undefined, name: string): string {
  if (draft?.writing) {
    return "Ask again";
  }
  return draft?.markdown ? "Rewrite from current decisions" : `Write ${name} draft`;
}

/** Whether the agent is writing the draft, or the decisions it was written from have changed. */
function DraftStatus({ state, draft, name, writing, onRewrite }: { state: ForgeState; draft: Draft | undefined; name: string; writing: boolean; onRewrite(): void }) {
  if (writing) {
    return (
      <ForgeBanner tone="blue">
        <span>
          The agent is writing the {name}
          {draft?.markdown ? ". The previous draft stays below until the new one arrives." : "…"}
        </span>
      </ForgeBanner>
    );
  }
  if (!draft?.markdown) {
    return null;
  }
  const current = decisionBasis(state);
  const changed = [...new Set([...Object.keys(draft.basis), ...Object.keys(current)])].filter((id) => draft.basis[id] !== current[id]);
  if (!changed.length) {
    return null;
  }
  return (
    <ForgeBanner tone="blue">
      <span>
        Out of date. Changed since this draft: <IdChips ids={changed} />
      </span>
      <Button onClick={onRewrite}>Rewrite</Button>
    </ForgeBanner>
  );
}

export function DraftPanel() {
  const post = usePost();
  const state = useForge(selectState);
  const [kind, setKind] = useStoredState<DraftKind>("forge:draftKind", "spec");
  const name = DRAFT_NAMES[kind];
  const draft = state.drafts[kind];
  const pending = usePending(`draft:${kind}`);
  const markdown = draft?.markdown ?? "";
  const parsed = useMemo(() => (markdown ? parseDraft(markdown, kind) : undefined), [markdown, kind]);
  const request = () => void post({ type: "draft", kind }, `draft:${kind}`);
  const written = parsed && draft ? writtenLine(draft, parsed.tbds.length) : "";
  return (
    <div className={css.panel}>
      <Panel>
        <div className={css.head}>
          <h3>Draft</h3>
          <Segmented options={KINDS} value={kind} onChange={setKind} />
          <span className={css.why}>{written}</span>
          <span className={css.actions}>
            {markdown ? <Button onClick={() => void copyText(markdown, "Copied the markdown.")}>Copy markdown</Button> : null}
            <Button kind="primary" disabled={pending} onClick={request}>
              {requestLabel(draft, name)}
            </Button>
          </span>
        </div>
        <DraftStatus state={state} draft={draft} name={name} writing={Boolean(draft?.writing) || pending} onRewrite={request} />
        {draft ? <ApprovalBar kind={kind} draft={draft} rfcRequested={state.rfcRequested} /> : null}
        {parsed ? (
          <div className={css.body}>
            <DraftSide outline={parsed.outline} tbds={parsed.tbds} />
            <DraftDoc tree={parsed.tree} />
          </div>
        ) : (
          <EmptyState title={`No ${name} draft yet.`}>The agent writes it from the decisions so far. Anything not decided yet shows as TBD, linked to its question.</EmptyState>
        )}
      </Panel>
    </div>
  );
}
