// Second opinions on one target: ask another model to review it, triage what
// it found, send accepted findings back to the author, and see what changed.
import { useMemo, useState } from "react";
import { PRESET_PROMPTS, type Opinion, type OpinionFinding, type OpinionStatus, type OpinionTarget, type ReviewerDefaults, type Verdict } from "../../src/kit/opinion.ts";
import type { OpinionAction } from "../../src/kit/opinionActions.ts";
import { ChatThread } from "./ChatThread.tsx";
import { cx } from "./cx.ts";
import { useModels } from "./hooks/useModels.ts";
import { lineDiff } from "./lineDiff.ts";
import { Markdown } from "./Markdown.tsx";
import { AskRow } from "./primitives/AskRow.tsx";
import { Badge, type Tone } from "./primitives/Badge.tsx";
import { Button } from "./primitives/Button.tsx";
import { Row } from "./primitives/Row.tsx";
import { Working } from "./primitives/Working.tsx";
import css from "./SecondOpinion.module.css";
import { createSurfaceHooks, usePending } from "./store.ts";
import { UnifiedDiff } from "./UnifiedDiff.tsx";

const { usePost } = createSurfaceHooks<unknown, OpinionAction>();

const STATUS = {
  reviewing: ["reviewing…", "info"],
  triage: ["triage findings", "amber"],
  correcting: ["author correcting…", "info"],
  revised: ["revised", "ok"],
  settled: ["settled", "muted"],
  failed: ["failed", "err"],
} satisfies Record<OpinionStatus, [string, Tone]>;

const VERDICT_LABEL = { pending: "Untriaged", accept: "Accept", reject: "Reject", discuss: "Discuss" } satisfies Record<Verdict, string>;
const CHOICES: readonly Verdict[] = ["accept", "reject", "discuss"];

function RequestForm({ target, defaults, busy, onSent }: { target: OpinionTarget; defaults: ReviewerDefaults; busy: boolean; onSent(): void }) {
  const post = usePost();
  const models = useModels();
  const prompts = useMemo(() => [...defaults.prompts, ...PRESET_PROMPTS.filter((p) => !defaults.prompts.some((d) => d.name === p.name))], [defaults.prompts]);
  const [model, setModel] = useState(defaults.model ?? "");
  const [promptName, setPromptName] = useState(prompts[0]?.name ?? "");
  const [prompt, setPrompt] = useState(prompts[0]?.text ?? "");
  const [passes, setPasses] = useState(1);
  const key = `opinion:${target.kind}:${target.id}`;
  const pending = usePending(key);
  const chosen = model || defaults.model || models[0] || "";
  const pick = (name: string) => {
    setPromptName(name);
    setPrompt(prompts.find((p) => p.name === name)?.text ?? "");
  };
  return (
    <div className={css.form}>
      <label>
        Reviewer
        <select value={chosen} onChange={(e) => setModel(e.target.value)}>
          {models.length ? null : <option value="">loading models…</option>}
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>
      <label>
        Prompt
        <select value={promptName} onChange={(e) => pick(e.target.value)}>
          {prompts.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
            </option>
          ))}
          <option value="">Custom…</option>
        </select>
      </label>
      <label>
        Passes
        <select value={passes} onChange={(e) => setPasses(Number(e.target.value))}>
          {[1, 2, 3].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <textarea rows={3} value={prompt} placeholder="What should the reviewer look for?" onChange={(e) => setPrompt(e.target.value)} />
      <Row end>
        <Button
          kind="primary"
          disabled={busy || pending || !chosen || !prompt.trim()}
          onClick={async () => {
            if (await post({ type: "opinion.request", targetKind: target.kind, targetId: target.id, model: chosen, prompt, promptName: promptName || undefined, maxPasses: passes }, key)) {
              onSent();
            }
          }}
        >
          Ask for a second opinion
        </Button>
      </Row>
    </div>
  );
}

function FindingCard({ opinion, finding: f }: { opinion: Opinion; finding: OpinionFinding }) {
  const post = usePost();
  const locked = opinion.status === "reviewing" || opinion.status === "correcting" || Boolean(f.outcome);
  const declined = f.outcome?.status === "declined";
  return (
    <div className={cx(css.finding, css[f.verdict])}>
      <div className={css.head}>
        <Badge severity={f.severity}>{f.severity}</Badge>
        <b className={css.id}>{f.id}</b>
        <span className={css.claim}>{f.claim}</span>
      </div>
      {f.evidence ? <div className={css.detail}>Evidence: {f.evidence}</div> : null}
      {f.suggestion ? <div className={css.detail}>Suggests: {f.suggestion}</div> : null}
      <Row>
        {CHOICES.map((v) => (
          <Button key={v} size="small" on={f.verdict === v} disabled={locked} onClick={() => void post({ type: "opinion.verdict", opinionId: opinion.id, findingIds: [f.id], verdict: v })}>
            {VERDICT_LABEL[v]}
          </Button>
        ))}
      </Row>
      {f.outcome ? (
        <div className={cx(css.outcome, declined && css.declined)}>
          <b>{declined ? "Author declined" : "Author fixed"}:</b> {f.outcome.reply}
          {declined && !f.ruling ? (
            <Row>
              <Button size="small" onClick={() => void post({ type: "opinion.rule", opinionId: opinion.id, findingId: f.id, side: "author" })}>
                Keep the author's version
              </Button>
              <Button size="small" onClick={() => void post({ type: "opinion.rule", opinionId: opinion.id, findingId: f.id, side: "reviewer" })}>
                Side with the reviewer
              </Button>
            </Row>
          ) : null}
          {f.ruling ? <div className={css.detail}>You sided with the {f.ruling === "author" ? "author" : "reviewer"}.</div> : null}
        </div>
      ) : null}
      {f.verdict === "discuss" || f.thread.length ? (
        <>
          <ChatThread messages={f.thread} />
          <AskRow placeholder="Ask about this finding" pendingKey={`opinion-ask:${f.id}`} onSend={(text) => post({ type: "opinion.ask", opinionId: opinion.id, findingId: f.id, text }, `opinion-ask:${f.id}`)} />
        </>
      ) : null}
    </div>
  );
}

const owedCount = (o: Opinion) => o.findings.filter((f) => f.verdict === "accept" && (!f.outcome || f.ruling === "reviewer")).length;
const untriaged = (o: Opinion) => o.findings.filter((f) => f.verdict === "pending" && !f.outcome);

/** Send corrections, review again, or settle, as the opinion's state allows. */
function OpinionActions({ opinion: o }: { opinion: Opinion }) {
  const post = usePost();
  const toSend = owedCount(o);
  const idle = o.status === "triage" || o.status === "revised";
  return (
    <Row end>
      {idle && !untriaged(o).length && toSend > 0 ? (
        <Button kind="primary" onClick={() => void post({ type: "opinion.send", opinionId: o.id }, `opinion-send:${o.id}`)}>
          Send {toSend} to the author
        </Button>
      ) : null}
      {idle && o.pass < o.maxPasses ? <Button onClick={() => void post({ type: "opinion.reReview", opinionId: o.id })}>Review again (pass {o.pass + 1})</Button> : null}
      {idle || o.status === "failed" ? <Button onClick={() => void post({ type: "opinion.settle", opinionId: o.id })}>Settle</Button> : null}
    </Row>
  );
}

function OpinionCard({ opinion: o }: { opinion: Opinion }) {
  const post = usePost();
  const [label, tone] = STATUS[o.status];
  const pending = untriaged(o);
  const toSend = owedCount(o);
  return (
    <div className={css.opinion}>
      <div className={css.head}>
        <b className={css.id}>{o.id}</b>
        <Badge tone={tone}>{label}</Badge>
        <span className={css.meta}>
          {o.reviewer.model} · {o.reviewer.promptName ?? "custom prompt"} · pass {o.pass}/{o.maxPasses}
        </span>
      </div>
      {o.status === "reviewing" ? <Working>The reviewer is reading it.</Working> : null}
      {o.status === "correcting" ? <Working>The author is applying {toSend || "the"} accepted finding{toSend === 1 ? "" : "s"}.</Working> : null}
      {o.note ? <div className={css.detail}>{o.note}</div> : null}
      {o.summary ? <Markdown text={o.summary} /> : null}
      {pending.length > 1 ? (
        <Row>
          <span className={css.meta}>{pending.length} untriaged:</span>
          {CHOICES.slice(0, 2).map((v) => (
            <Button key={v} size="small" onClick={() => void post({ type: "opinion.verdict", opinionId: o.id, findingIds: pending.map((f) => f.id), verdict: v })}>
              {VERDICT_LABEL[v]} all
            </Button>
          ))}
        </Row>
      ) : null}
      {o.findings.map((f) => (
        <FindingCard key={f.id} opinion={o} finding={f} />
      ))}
      {o.before !== undefined && o.after !== undefined ? (
        <details className={css.diff}>
          <summary>What the corrections changed</summary>
          <UnifiedDiff text={lineDiff(o.before, o.after)} />
        </details>
      ) : null}
      <OpinionActions opinion={o} />
    </div>
  );
}

export interface SecondOpinionProps {
  target: OpinionTarget;
  /** Every opinion of the workflow; this shows the ones on target. */
  opinions: readonly Opinion[];
  defaults: ReviewerDefaults;
}

export function SecondOpinion({ target, opinions, defaults }: SecondOpinionProps) {
  const mine = useMemo(() => opinions.filter((o) => o.target.kind === target.kind && o.target.id === target.id), [opinions, target.kind, target.id]);
  const busy = mine.some((o) => o.status === "reviewing" || o.status === "correcting");
  const [open, setOpen] = useState(false);
  return (
    <div className={css.wrap}>
      {mine.map((o) => (
        <OpinionCard key={o.id} opinion={o} />
      ))}
      {open || !mine.length ? (
        <details className={css.request} open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
          <summary>Second opinion on {target.label}</summary>
          <RequestForm target={target} defaults={defaults} busy={busy} onSent={() => setOpen(false)} />
        </details>
      ) : (
        <Button size="small" disabled={busy} onClick={() => setOpen(true)}>
          Another second opinion
        </Button>
      )}
    </div>
  );
}
