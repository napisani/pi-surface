// The Findings view: one simplification at a time, smallest concession first.
// What accepting gives up and buys, its trade-offs, follow-ups, and the decision.
import { useMemo, useState } from "react";
import { cx } from "../../../../web/kit/cx.ts";
import { useHashState } from "../../../../web/kit/hooks/useHashState.ts";
import { useCommands, useKeyboard } from "../../../../web/kit/keyboardContext.ts";
import { Badge } from "../../../../web/kit/primitives/Badge.tsx";
import { Banner } from "../../../../web/kit/primitives/Banner.tsx";
import { Button } from "../../../../web/kit/primitives/Button.tsx";
import { EmptyState } from "../../../../web/kit/primitives/EmptyState.tsx";
import { Sub } from "../../../../web/kit/primitives/Sub.tsx";
import { usePending } from "../../../../web/kit/store.ts";
import { ordered, type EntropyState, type Finding } from "../state.ts";
import { ConcessionBadge } from "./ConcessionBadge.tsx";
import { FindingCard } from "./FindingCard.tsx";
import css from "./FindingsView.module.css";
import { FollowUps } from "./FollowUps.tsx";
import { useEntropy, usePost } from "./hooks.ts";
import { openFinding } from "./nav.ts";
import { SendBanner } from "./SendDecisions.tsx";
import { TradeOffs } from "./TradeOffs.tsx";

const selectFindings = (s: EntropyState) => s.findings;

function Switcher({ findings, current }: { findings: readonly Finding[]; current: string }) {
  return (
    <div className={css.switch}>
      {findings.map((x) => (
        <button key={x.id} type="button" className={cx(css.chip, css[x.status], x.id === current && css.on)} onClick={() => openFinding(x.id)}>
          {x.id} {x.title}
          <span className={css.status}>{x.status}</span>
        </button>
      ))}
    </div>
  );
}

function DecisionBar({ finding: f, onDecided }: { finding: Finding; onDecided(): void }) {
  const post = usePost();
  const [note, setNote] = useState("");
  const key = `decide:${f.id}`;
  const busy = usePending(key);
  const decide = async (verdict: "accept" | "decline") => {
    if (await post({ type: "decide", findingId: f.id, verdict, note: note.trim() }, key)) {
      setNote("");
      onDecided();
    }
  };
  return (
    <div className={css.decide}>
      <input placeholder="Optional note with your decision…" value={note} onChange={(e) => setNote(e.target.value)} />
      <Button disabled={busy} kind={f.recommended === "decline" ? "primary" : "plain"} onClick={() => void decide("decline")}>
        Decline
      </Button>
      <Button disabled={busy} kind={f.recommended === "accept" ? "primary" : "plain"} onClick={() => void decide("accept")}>
        Accept
      </Button>
    </div>
  );
}

function SettledBanner({ finding: f }: { finding: Finding }) {
  const post = usePost();
  const overrode = (f.status === "accepted" ? "accept" : "decline") !== f.recommended;
  return (
    <Banner tone={f.status === "accepted" ? "done" : "info"}>
      <span className={css.grow}>
        {f.status === "accepted" ? "Accepted" : "Declined"}
        {overrode ? (
          <>
            {" "}
            <Badge tone="link">override</Badge>
          </>
        ) : null}
        {f.note ? ` · ${f.note}` : ""}
      </span>
      <Button onClick={() => void post({ type: "reopen", findingId: f.id })}>Reopen</Button>
    </Banner>
  );
}

export function FindingsView() {
  const raw = useEntropy(selectFindings);
  const findings = useMemo(() => ordered(raw), [raw]);
  const [param] = useHashState("finding", "");
  const f = findings.find((x) => x.id === param) ?? findings.find((x) => x.status === "open") ?? findings.at(-1);
  const keyboard = useKeyboard();
  useCommands([
    { id: "entropy.findings", label: "Find a finding", keys: ["<leader>fq"], run: () => keyboard?.pick("Findings", findings.map((x) => ({ id: x.id, label: `${x.id} ${x.title}`, detail: x.status, run: () => openFinding(x.id) }))) },
  ]);
  if (!f) {
    return <EmptyState title="Waiting for the agent to post findings…">Findings show up here when the agent posts them.</EmptyState>;
  }
  const next = () => {
    const after = findings.find((x) => x.status === "open" && x.id !== f.id);
    if (after) {
      openFinding(after.id);
    }
  };
  return (
    <>
      <SendBanner />
      <Switcher findings={findings} current={f.id} />
      <h2>{f.title}</h2>
      <Sub>
        {f.id} · <ConcessionBadge concession={f.concession} /> · −{f.lines} lines · −{f.concepts.length} concept{f.concepts.length === 1 ? "" : "s"} · recommended: {f.recommended}
        {f.after?.length ? (
          <>
            {" "}
            · builds on{" "}
            {f.after.map((id) => (
              <Badge key={id} onClick={() => openFinding(id)}>
                {id}
              </Badge>
            ))}
          </>
        ) : null}
      </Sub>
      {f.status === "open" ? null : <SettledBanner finding={f} />}
      <div className={css.grid}>
        <div>
          <FindingCard finding={f} />
          {f.status === "open" ? <DecisionBar key={f.id} finding={f} onDecided={next} /> : null}
        </div>
        <div className={css.side}>
          <TradeOffs finding={f} others={findings.filter((x) => x.id !== f.id)} />
          <FollowUps finding={f} />
        </div>
      </div>
    </>
  );
}
