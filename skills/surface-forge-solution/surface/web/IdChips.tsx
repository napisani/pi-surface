import type { ForgeState } from "../state.ts";
import { useForge } from "./hooks.ts";
import css from "./IdChips.module.css";
import { openQuestion } from "./nav.ts";

const selectQuestions = (s: ForgeState) => s.questions;

/** Decision ids; the ones with a question open it on click. */
export function IdChips({ ids, separator = " " }: { ids: readonly string[]; separator?: string }) {
  const questions = useForge(selectQuestions);
  return (
    <>
      {ids.map((id, i) => (
        <span key={id}>
          {i ? separator : ""}
          {questions.some((q) => q.id === id) ? (
            <button
              type="button"
              className={css.id}
              onClick={(e) => {
                e.stopPropagation();
                openQuestion(id);
              }}
            >
              {id}
            </button>
          ) : (
            id
          )}
        </span>
      ))}
    </>
  );
}
