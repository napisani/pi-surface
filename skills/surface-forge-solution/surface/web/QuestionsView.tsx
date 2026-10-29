// The Questions view: one design decision at a time. Options compared by a
// chosen lens, their trade-offs and effect on the spec, follow-ups, and the answer.
import { useState } from "react";
import { cx } from "../../../../web/kit/cx.ts";
import { DeltaBars } from "../../../../web/kit/DeltaBars.tsx";
import { useGlobalKey } from "../../../../web/kit/hooks/useGlobalKey.ts";
import { useHashState } from "../../../../web/kit/hooks/useHashState.ts";
import { ImpactList } from "../../../../web/kit/ImpactList.tsx";
import { OPTION_COLORS, OptionCard } from "../../../../web/kit/OptionCard.tsx";
import { Badge } from "../../../../web/kit/primitives/Badge.tsx";
import { Button } from "../../../../web/kit/primitives/Button.tsx";
import { EmptyState } from "../../../../web/kit/primitives/EmptyState.tsx";
import { Panel } from "../../../../web/kit/primitives/Panel.tsx";
import { Sub } from "../../../../web/kit/primitives/Sub.tsx";
import { usePending } from "../../../../web/kit/store.ts";
import { specDimensionsOf, type Decision, type ForgeState, type Question } from "../state.ts";
import { FollowUps } from "./FollowUps.tsx";
import { ForgeBanner } from "./ForgeBanner.tsx";
import { useForge, usePost } from "./hooks.ts";
import { LensBar } from "./LensBar.tsx";
import { openQuestion } from "./nav.ts";
import css from "./QuestionsView.module.css";
import { TradeOffs } from "./TradeOffs.tsx";

const selectState = (s: ForgeState) => s;
const colorOf = (index: number) => OPTION_COLORS[index % OPTION_COLORS.length];

function Switcher({ questions, current }: { questions: readonly Question[]; current: string }) {
  return (
    <div className={css.switch}>
      Questions:
      {questions.map((x) => (
        <button key={x.id} type="button" className={cx(css.chip, x.id === current && css.on)} onClick={() => openQuestion(x.id)}>
          {x.id} {x.header}
          <span className={css.status}>{x.status}</span>
        </button>
      ))}
    </div>
  );
}

function AnswerBar({ question: q, selectedId, onAnswered }: { question: Question; selectedId: string; onAnswered(): void }) {
  const post = usePost();
  const [note, setNote] = useState("");
  const key = `answer:${q.id}`;
  const submit = async () => {
    if (await post({ type: "answer", questionId: q.id, optionId: selectedId, note: note.trim() }, key)) {
      setNote("");
      onAnswered();
    }
  };
  return (
    <div className={css.answer}>
      <input placeholder="Optional note with your answer…" value={note} onChange={(e) => setNote(e.target.value)} />
      <Button onClick={() => void post({ type: "defer", questionId: q.id }, key)}>Defer</Button>
      <Button kind="primary" onClick={() => void submit()}>
        Submit
      </Button>
    </div>
  );
}

/** The option shown selected before the user picks one: the decided one, else the recommended one. */
function defaultOption(question: Question, decision: Decision | undefined): string {
  if (decision?.status === "decided" && decision.optionId) {
    return decision.optionId;
  }
  return (question.options.find((o) => o.recommended) ?? question.options[0]).id;
}

/** An answered or deferred question: what was decided, and what the agent waits for before it continues. */
function SettledBanner({ question: q, decision, roundOpen }: { question: Question; decision: Decision | undefined; roundOpen: number }) {
  const post = usePost();
  return (
    <ForgeBanner tone={q.status === "answered" ? "green" : "blue"}>
      <span>
        {q.status === "answered" ? (
          <>
            Answered: <b>{decision?.label}</b>
            {decision?.overrodeRecommendation ? (
              <>
                {" "}
                <Badge tone="link">override</Badge>
              </>
            ) : null}
            {decision?.note ? ` · ${decision.note}` : ""}
          </>
        ) : (
          "Deferred"
        )}
      </span>
      {roundOpen ? (
        <span className={css.why}>
          The agent continues after the other {roundOpen} open question{roundOpen > 1 ? "s" : ""} in round {q.round} {roundOpen > 1 ? "are" : "is"} answered or deferred.
        </span>
      ) : null}
      <Button onClick={() => void post({ type: "revisit", decisionId: q.id })}>Revisit</Button>
    </ForgeBanner>
  );
}

export function QuestionsView() {
  const state = useForge(selectState);
  const [qParam] = useHashState("question", "");
  // Per question, so switching away and back keeps the user's place.
  const [lensOf, setLensOf] = useState<Readonly<Record<string, string>>>({});
  const [selectedOf, setSelectedOf] = useState<Readonly<Record<string, string>>>({});
  const questions = state.questions;
  const q = questions.find((x) => x.id === qParam) ?? questions.find((x) => x.status === "open") ?? questions.at(-1);
  const answering = usePending(q ? `answer:${q.id}` : "");

  useGlobalKey((event) => {
    const lens = q?.lenses[Number(event.key) - 1];
    if (q && lens) {
      setLensOf((prev) => ({ ...prev, [q.id]: lens.id }));
    }
  });

  if (!q) {
    return <EmptyState title="Waiting for the agent to post a question…">Questions show up here when the agent posts them.</EmptyState>;
  }

  const lens = q.lenses.find((l) => l.id === lensOf[q.id]) ?? q.lenses[0];
  const decision = state.decisions.find((d) => d.id === q.id);
  const selectedId = q.options.some((o) => o.id === selectedOf[q.id]) ? selectedOf[q.id] : defaultOption(q, decision);
  const selected = q.options.find((o) => o.id === selectedId)!;
  const locked = q.status !== "open";
  const roundQs = questions.filter((x) => x.round === q.round);
  const roundOpen = roundQs.filter((x) => x.status === "open").length;
  const progress = roundQs.length > 1 ? ` · ${roundQs.length - roundOpen} of ${roundQs.length} settled` : "";
  const select = (id: string) => {
    if (!locked) {
      setSelectedOf((prev) => ({ ...prev, [q.id]: id }));
    }
  };
  const next = () => {
    const after = questions.find((x) => x.status === "open" && x.id !== q.id);
    if (after) {
      openQuestion(after.id);
    }
  };

  return (
    <>
      <Switcher questions={questions} current={q.id} />
      <h2>{q.title}</h2>
      <Sub>
        {q.header} · round {q.round}
        {progress}
        {q.prerequisites?.length ? (
          <>
            {" "}
            · depends on{" "}
            {q.prerequisites.map((p) => (
              <Badge key={p}>{p}</Badge>
            ))}
          </>
        ) : null}
      </Sub>
      {locked ? <SettledBanner question={q} decision={decision} roundOpen={roundOpen} /> : null}
      {!locked && answering ? (
        <ForgeBanner>
          <span>Sending…</span>
        </ForgeBanner>
      ) : null}
      <div className={css.grid}>
        <div>
          <LensBar lenses={q.lenses} active={lens.id} onPick={(id) => setLensOf((prev) => ({ ...prev, [q.id]: id }))} />
          {q.options.map((o, i) => (
            <OptionCard
              key={o.id}
              option={o}
              lens={lens}
              color={colorOf(i)}
              selected={o.id === selectedId}
              locked={locked}
              chosen={decision?.status === "decided" && decision.optionId === o.id}
              onSelect={select}
            />
          ))}
          {locked ? null : <AnswerBar key={q.id} question={q} selectedId={selectedId} onAnswered={next} />}
        </div>
        <div className={css.side}>
          <TradeOffs question={q} selectedId={selectedId} colorOf={colorOf} />
          <Panel>
            <h3>
              Effect on the spec if you pick <span className={css.pick}>{selected.label}</span>
            </h3>
            <DeltaBars dimensions={specDimensionsOf(state)} deltas={selected.specDelta ?? {}} />
            <ImpactList items={selected.impact} />
          </Panel>
          <FollowUps question={q} selectedId={selectedId} />
        </div>
      </div>
    </>
  );
}
