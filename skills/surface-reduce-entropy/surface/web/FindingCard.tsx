// What accepting one finding means: what is given up, what the code becomes,
// its pros and cons, and the before/after code.
import { memo } from "react";
import { Panel } from "../../../../web/kit/primitives/Panel.tsx";
import { Visuals } from "../../../../web/kit/Visuals.tsx";
import { CONCESSION_HINT, type Finding } from "../state.ts";
import css from "./FindingCard.module.css";

export const FindingCard = memo(function FindingCard({ finding: f }: { finding: Finding }) {
  return (
    <Panel>
      <div className={css.facts}>
        <div>
          <b className={css.label}>Gives up</b>
          <p>{f.givesUp}</p>
          <p className={css.hint}>{CONCESSION_HINT[f.concession]}</p>
        </div>
        <div>
          <b className={css.label}>Becomes</b>
          <p>{f.simplification}</p>
          {f.concepts.length ? (
            <p className={css.hint}>
              Removes{" "}
              {f.concepts.map((c) => (
                <code key={c} className={css.concept}>
                  {c}
                </code>
              ))}
            </p>
          ) : null}
        </div>
      </div>
      <div className={css.proscons}>
        <div className={css.pros}>
          <b>Pros of accepting</b>
          <ul>
            {f.pros.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
        <div className={css.cons}>
          <b>Cons of accepting</b>
          <ul>
            {f.cons.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      </div>
      {/* Keyed by finding so its tabs start on the before/after diff. */}
      <Visuals key={f.id} visuals={f.visuals} />
    </Panel>
  );
});
