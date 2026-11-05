// The Walkthrough tab: an ordered tour of the changes, one step beside its code.
import { useMemo, useRef, useState } from "react";
import { AgentComposer } from "../../../../web/kit/AgentComposer.tsx";
import { anchorOf } from "../../../../src/kit/code.ts";
import { useHashState } from "../../../../web/kit/hooks/useHashState.ts";
import { Markdown } from "../../../../web/kit/Markdown.tsx";
import { AskRow } from "../../../../web/kit/primitives/AskRow.tsx";
import { Button } from "../../../../web/kit/primitives/Button.tsx";
import { EmptyState } from "../../../../web/kit/primitives/EmptyState.tsx";
import { Panel } from "../../../../web/kit/primitives/Panel.tsx";
import { TaskBar } from "../../../../web/kit/primitives/TaskBar.tsx";
import { SecondOpinion } from "../../../../web/kit/SecondOpinion.tsx";
import { usePending } from "../../../../web/kit/store.ts";
import { TaskBanner } from "../../../../web/kit/TaskBanner.tsx";
import { Tour } from "../../../../web/kit/Tour.tsx";
import type { ReviewState } from "../state.ts";
import { useMode, usePost, useReview } from "./hooks.ts";
import { sideRev } from "./lineItems.ts";
import { useNav } from "./nav.ts";
import { QuestionCard } from "./QuestionCard.tsx";

const selectTour = (s: ReviewState) => s.walkthrough;
const selectOpinions = (s: ReviewState) => s.opinions;
const selectReviewer = (s: ReviewState) => s.reviewer;
const WALKTHROUGH_TARGET = { kind: "walkthrough", id: "tour", label: "the walkthrough" };
const selectQuestions = (s: ReviewState) => s.questions;
const selectFiles = (s: ReviewState) => s.files;

function generateLabel(running: boolean, written: boolean): string {
  if (running) {
    return "Writing…";
  }
  return written ? "Regenerate" : "Generate walkthrough";
}

export function WalkthroughTab() {
  const post = usePost();
  const conversation = useRef<HTMLDivElement>(null);
  const nav = useNav();
  const mode = useMode();
  const tour = useReview(selectTour);
  const opinions = useReview(selectOpinions);
  const reviewer = useReview(selectReviewer);
  const questions = useReview(selectQuestions);
  const files = useReview(selectFiles);
  const starting = usePending("tour");
  const [focus, setFocus] = useState("");
  const [stepParam, setStep] = useHashState("step", "1");
  const running = tour.status === "running";
  const steps = tour.steps;
  const index = Math.min(Math.max(Number(stepParam) - 1 || 0, 0), Math.max(steps.length - 1, 0));
  const go = (i: number) => setStep(String(Math.max(0, Math.min(steps.length - 1, i)) + 1));
  const step = steps[index];
  const stepQuestions = useMemo(() => (step ? questions.filter((q) => q.stepId === step.id) : []), [questions, step]);
  const inPr = Boolean(step) && files.some((f) => f.path === step.ref.path);
  return (
    <>
      <TaskBar title={tour.title ?? "Walkthrough"} sub="The agent picks the parts of the change worth reading, puts them in order, and explains each one.">
        <input placeholder="Optional focus, e.g. the data flow" value={focus} onChange={(e) => setFocus(e.target.value)} />
        <Button kind="primary" disabled={running || starting} onClick={() => void post({ type: "walkthrough.run", focus }, "tour")}>
          {generateLabel(running, steps.length > 0)}
        </Button>
      </TaskBar>
      <TaskBanner task={tour} running="The agent is reading the changes and writing the walkthrough." failed="Walkthrough failed" onStop={() => void post({ type: "task.stop", task: "walkthrough" })} />
      {!step && !running ? <EmptyState title="No walkthrough yet.">Click Generate walkthrough to get the change explained step by step.</EmptyState> : null}
      {step ? (
        <>
          {tour.summary ? (
            <Panel>
              <Markdown text={tour.summary} />
            </Panel>
          ) : null}
          <Tour
            steps={steps}
            index={index}
            go={go}
            extras={
              <div ref={conversation} tabIndex={-1}>
                <AgentComposer id="review.walkthrough" prepare={() => ({ key: `step:${step.id}`, label: step.title, reference: `@${step.ref.path}:${step.ref.startLine}-${step.ref.endLine} (${step.ref.rev})`, ask: (text) => post({ type: "question.ask", stepId: step.id, text }, `step-${step.id}`), onSent: () => conversation.current?.focus() })} />
                {stepQuestions.map((q) => (
                  <QuestionCard key={q.id} question={q} />
                ))}
                <AskRow
                  key={step.id}
                  placeholder="Ask the agent about this step…"
                  pendingKey={`step-${step.id}`}
                  onSend={(text) => post({ type: "question.ask", stepId: step.id, text }, `step-${step.id}`)}
                />
              </div>
            }
            refProps={{
              diffRev: sideRev(mode, "RIGHT"),
              label: step.ref.rev === "base" ? "before" : "",
              onOpen: inPr ? () => nav.jumpTo(anchorOf(step.ref)) : undefined,
            }}
          />
          {running ? null : <SecondOpinion target={WALKTHROUGH_TARGET} opinions={opinions} defaults={reviewer} />}
        </>
      ) : null}
    </>
  );
}
