import { CodeRef } from "../../../../web/kit/CodeRef.tsx";
import { LevelBadge } from "../../../../web/kit/LevelBadge.tsx";
import { Markdown } from "../../../../web/kit/Markdown.tsx";
import { Badge } from "../../../../web/kit/primitives/Badge.tsx";
import { Button } from "../../../../web/kit/primitives/Button.tsx";
import { Kv } from "../../../../web/kit/primitives/Kv.tsx";
import { Row } from "../../../../web/kit/primitives/Row.tsx";
import { Section } from "../../../../web/kit/primitives/Section.tsx";
import { Spacer } from "../../../../web/kit/primitives/Spacer.tsx";
import { Text } from "../../../../web/kit/primitives/Text.tsx";
import { Working } from "../../../../web/kit/primitives/Working.tsx";
import { Visuals } from "../../../../web/kit/Visuals.tsx";
import type { FeedbackItem, FeedbackState } from "../state.ts";
import css from "./AnalysisPane.module.css";
import { useFeedback, usePost } from "./hooks.ts";
import { RECOMMENDATION_TONE, REV_LABEL } from "./labels.ts";

const selectTriaging = (s: FeedbackState) => s.triage.status === "running";

/** The agent's triage of an item: what it means, what to do, how risky and how big. */
export function AnalysisPane({ item }: { item: FeedbackItem }) {
  const post = usePost();
  const triaging = useFeedback(selectTriaging);
  const a = item.analysis;
  if (!a) {
    return (
      <Section title="Analysis">
        {triaging ? (
          <Working>The agent is triaging…</Working>
        ) : (
          <Row>
            <Text tone="faint">Not triaged yet.</Text>
            <Spacer />
            <Button onClick={() => void post({ type: "triage.run", itemIds: [item.id] }, "triage")}>✦ Triage this</Button>
          </Row>
        )}
      </Section>
    );
  }
  return (
    <Section title="What it means">
      <Markdown text={a.meaning} className={css.meaning} />
      <Kv label="Agent">
        <div className={css.agent}>
          <Badge tone={RECOMMENDATION_TONE[a.recommendation]}>{a.recommendation === "respond" ? "respond only" : a.recommendation}</Badge>
          <Markdown text={a.rationale} />
        </div>
      </Kv>
      <Kv label="Ratings">
        <div className={css.ratings}>
          <LevelBadge name="risk" level={a.risk} title="Risk the change introduces" />
          <LevelBadge name="importance" level={a.importance} title="How much it matters to the PR's goal" />
          <LevelBadge name="rework" level={a.rework} title="How much code changes" />
        </div>
      </Kv>
      {a.promised ? <Kv label="Promised">You already said you'd fix this{a.promisedFix ? `: ${a.promisedFix}` : "."}</Kv> : null}
      {a.nextStep ? (
        <Kv label="Next step">
          <Markdown text={a.nextStep} />
        </Kv>
      ) : null}
      {a.refs.map((r, i) => (
        <CodeRef key={`${r.path}:${r.rev}:${r.startLine}`} role={i === 0 ? "Code" : "Related"} codeRef={r} label={REV_LABEL[r.rev]} />
      ))}
      <Visuals key={item.id} visuals={a.visuals} />
    </Section>
  );
}
