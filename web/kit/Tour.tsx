// A guided tour: an ordered step list beside the current step, its code and visual.
import type { KeyboardEvent, ReactNode } from "react";
import type { TourStep } from "../../src/kit/tour.ts";
import { CodeRef, type CodeRefProps } from "./CodeRef.tsx";
import { cx } from "./cx.ts";
import { Markdown } from "./Markdown.tsx";
import { Button } from "./primitives/Button.tsx";
import { Row } from "./primitives/Row.tsx";
import { Spacer } from "./primitives/Spacer.tsx";
import { Text } from "./primitives/Text.tsx";
import css from "./Tour.module.css";
import { Visuals } from "./Visuals.tsx";

export interface TourProps {
  steps: readonly TourStep[];
  index: number;
  go(index: number): void;
  /** What sits under the step's text, e.g. questions about it. */
  extras?: ReactNode;
  refProps?: Omit<CodeRefProps, "codeRef">;
}

export function Tour({ steps, index, go, extras, refProps }: TourProps) {
  const step = steps[index];
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "j") {
      go(index + 1);
    }
    if (e.key === "ArrowLeft" || e.key === "k") {
      go(index - 1);
    }
  };
  return (
    <div className={css.layout} tabIndex={0} onKeyDown={onKey}>
      <ol className={css.steps}>
        {steps.map((s, i) => (
          <li key={s.id}>
            <button type="button" className={cx(css.step, i === index && css.on)} onClick={() => go(i)}>
              <span className={css.n}>{i + 1}</span>
              <span className={css.label}>
                <b>{s.title}</b>
                <span className={css.where}>
                  {s.ref.path}:{s.ref.startLine}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>
      <div className={css.panel}>
        <Row flush>
          <Text tone="faint">
            Step {index + 1} of {steps.length}
          </Text>
          <Spacer />
          <Button disabled={index === 0} onClick={() => go(index - 1)}>
            ← Prev
          </Button>
          <Button disabled={index === steps.length - 1} onClick={() => go(index + 1)}>
            Next →
          </Button>
        </Row>
        <h2 className={css.title}>{step.title}</h2>
        <Markdown text={step.body} />
        <div className={css.extras}>{extras}</div>
        {step.visual ? <Visuals key={step.id} visuals={[step.visual]} /> : null}
        <CodeRef codeRef={step.ref} tall {...refProps} />
      </div>
    </div>
  );
}
