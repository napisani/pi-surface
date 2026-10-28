import { cx } from "../../../../web/kit/cx.ts";
import { Badge, type Tone } from "../../../../web/kit/primitives/Badge.tsx";
import type { Decision, ForgeState, Question, QuestionStatus } from "../state.ts";
import css from "./DecisionMap.module.css";
import { openQuestion } from "./nav.ts";

const STATUS_TONE = { open: "neutral", answered: "teal", deferred: "info" } satisfies Record<QuestionStatus, Tone>;

/** What the map says about a question's decision. */
function choiceOf(question: Question, decision: Decision | undefined): string {
  if (question.status === "answered") {
    return decision?.label ?? "";
  }
  if (question.status === "deferred") {
    return "Deferred";
  }
  return decision?.status === "reopened" ? `Reopened, was “${decision.label}”` : "Not decided yet";
}

/** Every question by round, with what was chosen; a card opens its question. */
export function DecisionMap({ state }: { state: ForgeState }) {
  const rounds = [...new Set(state.questions.map((q) => q.round))].toSorted((a, b) => a - b);
  if (!rounds.length) {
    return <div className={css.why}>No questions yet.</div>;
  }
  return (
    <>
      {rounds.map((r) => (
        <div key={r} className={css.round}>
          <div className={css.label}>Round {r}</div>
          <div className={css.cards}>
            {state.questions
              .filter((q) => q.round === r)
              .map((q) => {
                const choice = choiceOf(
                  q,
                  state.decisions.find((x) => x.id === q.id),
                );
                return (
                  <button key={q.id} type="button" className={cx(css.card, css[q.status])} onClick={() => openQuestion(q.id)}>
                    <span className={css.top}>
                      <span className={css.id}>{q.id}</span>
                      {q.header}
                      <span className={css.status}>
                        <Badge tone={STATUS_TONE[q.status]}>{q.status}</Badge>
                      </span>
                    </span>
                    <span className={css.choice}>{choice}</span>
                    {q.prerequisites?.length ? <span className={css.dep}>after {q.prerequisites.join(", ")}</span> : null}
                  </button>
                );
              })}
          </div>
        </div>
      ))}
    </>
  );
}
