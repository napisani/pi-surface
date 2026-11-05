// The Artifacts tab: the RFC, architecture doc and decision log written from
// the plan for team buy-in, their approval, and the plan's reviewer defaults.
import { useState } from "react";
import { useModels } from "../../../../web/kit/hooks/useModels.ts";
import { Markdown } from "../../../../web/kit/Markdown.tsx";
import { Badge } from "../../../../web/kit/primitives/Badge.tsx";
import { Button } from "../../../../web/kit/primitives/Button.tsx";
import { Panel } from "../../../../web/kit/primitives/Panel.tsx";
import { Row } from "../../../../web/kit/primitives/Row.tsx";
import { Text } from "../../../../web/kit/primitives/Text.tsx";
import { Working } from "../../../../web/kit/primitives/Working.tsx";
import { SecondOpinion } from "../../../../web/kit/SecondOpinion.tsx";
import { usePending } from "../../../../web/kit/store.ts";
import { ARTIFACT_KINDS, ARTIFACT_NAMES, decisionBasis, type Artifact, type ArtifactKind, type Plan } from "../state.ts";
import css from "./ArtifactsView.module.css";
import { usePlan, usePost } from "./hooks.ts";

/** Decisions made or changed since the artifact was written. */
function staleness(plan: Plan, artifact: Artifact): number {
  const now = decisionBasis(plan);
  const keys = new Set([...Object.keys(now), ...Object.keys(artifact.basis)]);
  return [...keys].filter((k) => now[k] !== artifact.basis[k]).length;
}

function Status({ plan, artifact }: { plan: Plan; artifact: Artifact | undefined }) {
  if (!artifact) {
    return null;
  }
  const stale = !artifact.writing && artifact.markdown ? staleness(plan, artifact) : 0;
  return (
    <>
      {artifact.review ? <Badge tone={artifact.review.verdict === "approved" ? "ok" : "warn"}>{artifact.review.verdict === "approved" ? "approved" : "changes asked"}</Badge> : null}
      {artifact.final && !artifact.review ? <Badge tone="amber">final, awaiting you</Badge> : null}
      {stale ? (
        <Text tone="warn" small>
          {stale} decision{stale > 1 ? "s" : ""} changed since
        </Text>
      ) : null}
    </>
  );
}

function ReviewBar({ kind }: { kind: ArtifactKind }) {
  const post = usePost();
  const [note, setNote] = useState("");
  return (
    <Row>
      <input className={css.note} placeholder="What should change? (needed to send back)" value={note} onChange={(e) => setNote(e.target.value)} />
      <Button disabled={!note.trim()} onClick={() => void post({ type: "artifact.review", kind, verdict: "changes", note })}>
        Send back
      </Button>
      <Button kind="primary" onClick={() => void post({ type: "artifact.review", kind, verdict: "approve" })}>
        Approve
      </Button>
    </Row>
  );
}

function ArtifactCard({ kind, plan }: { kind: ArtifactKind; plan: Plan }) {
  const post = usePost();
  const busy = usePending(`artifact:${kind}`);
  const artifact = plan.artifacts[kind];
  const written = Boolean(artifact?.markdown) && !artifact?.writing;
  const waiting = written && artifact?.final && !artifact.review;
  return (
    <Panel>
      <div className={css.head}>
        <h3>{ARTIFACT_NAMES[kind]}</h3>
        <Status plan={plan} artifact={artifact} />
        <Button size="small" disabled={busy || artifact?.writing} onClick={() => void post({ type: "artifact.request", kind }, `artifact:${kind}`)}>
          {artifact?.markdown ? "Rewrite" : "Write it"}
        </Button>
      </div>
      {artifact?.writing ? <Working>The agent is writing it.</Working> : null}
      {artifact?.markdown ? (
        <details className={css.doc} open={Boolean(waiting)}>
          <summary>Read</summary>
          <Markdown text={artifact.markdown} />
        </details>
      ) : null}
      {waiting ? <ReviewBar kind={kind} /> : null}
      {written ? <SecondOpinion target={{ kind: "artifact", id: kind, label: `the ${ARTIFACT_NAMES[kind]}` }} opinions={plan.opinions} defaults={plan.reviewer} /> : null}
    </Panel>
  );
}

function ReviewerDefaults({ plan }: { plan: Plan }) {
  const post = usePost();
  const models = useModels();
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  return (
    <Panel>
      <h3>Second-opinion defaults</h3>
      <Row>
        <label className={css.label}>
          Default reviewer
          <select value={plan.reviewer.model ?? ""} onChange={(e) => void post({ type: "reviewer.set", model: e.target.value })}>
            <option value="">choose each time</option>
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      </Row>
      <h4 className={css.sub}>Saved review prompts</h4>
      {plan.reviewer.prompts.length ? null : <Text tone="faint">None yet; the built-in prompts are always offered.</Text>}
      {plan.reviewer.prompts.map((p) => (
        <div key={p.name} className={css.prompt}>
          <b>{p.name}</b> <Text tone="dim">{p.text}</Text>
          <Button size="small" kind="ghost" onClick={() => void post({ type: "reviewer.set", removePrompt: p.name })}>
            ×
          </Button>
        </div>
      ))}
      <div className={css.form}>
        <input placeholder="Prompt name" value={name} onChange={(e) => setName(e.target.value)} />
        <textarea rows={2} placeholder="What the reviewer should look for" value={text} onChange={(e) => setText(e.target.value)} />
        <Row end>
          <Button
            disabled={!name.trim() || !text.trim()}
            onClick={async () => {
              if (await post({ type: "reviewer.set", savePrompt: { name, text } })) {
                setName("");
                setText("");
              }
            }}
          >
            Save prompt
          </Button>
        </Row>
      </div>
    </Panel>
  );
}

export function ArtifactsView() {
  const plan = usePlan();
  return (
    <div className={css.layout}>
      {ARTIFACT_KINDS.map((kind) => (
        <ArtifactCard key={kind} kind={kind} plan={plan} />
      ))}
      <ReviewerDefaults plan={plan} />
    </div>
  );
}
