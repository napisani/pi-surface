import type { ReactNode } from "react";
import type { Finding } from "../../src/kit/findings.ts";
import css from "./FindingFacts.module.css";
import { Markdown } from "./Markdown.tsx";
import { Badge } from "./primitives/Badge.tsx";
import { Kv } from "./primitives/Kv.tsx";

/** Title, badges and the agent's account: summary, fix, evidence, how it was verified. */
export function FindingFacts({ finding: f, actions }: { finding: Finding; actions?: ReactNode }) {
  return (
    <>
      <div className={css.head}>
        <Badge severity={f.severity}>{f.severity}</Badge>
        <Badge>{f.confidence} confidence</Badge>
        <Badge>{f.category}</Badge>
        <span className={css.spacer} />
        {actions}
      </div>
      <h2 className={css.title}>
        {f.id} · {f.title}
      </h2>
      {f.confidenceReason ? <div className={css.reason}>Confidence: {f.confidenceReason}</div> : null}
      <Markdown text={f.summary} />
      {f.fix ? (
        <Kv label="Fix">
          <Markdown text={f.fix} />
        </Kv>
      ) : null}
      {f.evidence ? (
        <Kv label="Evidence">
          <Markdown text={f.evidence} />
        </Kv>
      ) : null}
      {f.verified ? (
        <Kv label="Verified">
          <Markdown text={f.verified} />
        </Kv>
      ) : null}
    </>
  );
}
