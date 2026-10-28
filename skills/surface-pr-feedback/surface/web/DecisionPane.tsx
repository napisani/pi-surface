import { useState } from "react";
import { AskRow } from "../../../../web/kit/primitives/AskRow.tsx";
import { Button } from "../../../../web/kit/primitives/Button.tsx";
import { Panel } from "../../../../web/kit/primitives/Panel.tsx";
import { Row } from "../../../../web/kit/primitives/Row.tsx";
import { Section } from "../../../../web/kit/primitives/Section.tsx";
import { Sub } from "../../../../web/kit/primitives/Sub.tsx";
import { usePending } from "../../../../web/kit/store.ts";
import type { Decision, FeedbackItem, Recommendation } from "../state.ts";
import css from "./DecisionPane.module.css";
import { FixCard } from "./FixCard.tsx";
import { usePost } from "./hooks.ts";
import { DECISION_LABEL } from "./labels.ts";

const CHOICES: readonly Recommendation[] = ["fix", "respond", "skip"];

/** Fix, respond only, or skip. Choosing Fix first asks what the agent should change. */
export function DecisionPane({ item }: { item: FeedbackItem }) {
  const post = usePost();
  const key = `decide-${item.id}`;
  const deciding = usePending(key);
  const [choosingFix, setChoosingFix] = useState(false);
  const rec = item.analysis?.recommendation;
  const sent = item.fix?.status === "sent";
  const choose = (decision: Decision) => {
    if (decision === "fix" && item.decision !== "fix") {
      setChoosingFix(true);
    } else {
      void post({ type: "item.decide", itemId: item.id, decision }, key);
    }
  };
  return (
    <Section title="Your decision">
      <Row>
        {CHOICES.map((d) => (
          <Button key={d} on={item.decision === d} disabled={sent || deciding} onClick={() => choose(d)}>
            {DECISION_LABEL[d]}
            {rec === d ? (
              <span className={css.mark} title="The agent's recommendation">
                {" "}
                ✦
              </span>
            ) : null}
          </Button>
        ))}
        {item.decision !== "undecided" && !sent ? (
          <Button kind="ghost" size="small" onClick={() => choose("undecided")}>
            Undo
          </Button>
        ) : null}
      </Row>
      {choosingFix ? (
        <Panel>
          <Sub>What should the agent change? It goes out with the next batch of fixes.</Sub>
          <AskRow
            placeholder="Instructions for the agent"
            pendingKey={key}
            label="Queue fix"
            initial={item.analysis?.nextStep ?? ""}
            onSend={async (text) => {
              const ok = await post({ type: "item.decide", itemId: item.id, decision: "fix", instruction: text }, key);
              if (ok) {
                setChoosingFix(false);
              }
              return ok;
            }}
          />
          <Row end>
            <Button kind="ghost" size="small" onClick={() => setChoosingFix(false)}>
              Cancel
            </Button>
          </Row>
        </Panel>
      ) : null}
      {item.fix ? <FixCard itemId={item.id} fix={item.fix} /> : null}
    </Section>
  );
}
