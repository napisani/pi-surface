// The Architecture tab: the system now and where the decisions take it, with
// each change traced to the decisions that drive it.
import { ArchDiffView } from "../../../../web/kit/ArchDiffView.tsx";
import { Markdown } from "../../../../web/kit/Markdown.tsx";
import { Badge } from "../../../../web/kit/primitives/Badge.tsx";
import { Button } from "../../../../web/kit/primitives/Button.tsx";
import { EmptyState } from "../../../../web/kit/primitives/EmptyState.tsx";
import { Panel } from "../../../../web/kit/primitives/Panel.tsx";
import { Row } from "../../../../web/kit/primitives/Row.tsx";
import { Text } from "../../../../web/kit/primitives/Text.tsx";
import { SecondOpinion } from "../../../../web/kit/SecondOpinion.tsx";
import { usePending } from "../../../../web/kit/store.ts";
import type { ChangeKind } from "../state.ts";
import css from "./ArchitectureView.module.css";
import { usePlan, usePost } from "./hooks.ts";
import { openNode } from "./nav.ts";

const KIND_TONE = { add: "ok", remove: "err", change: "warn" } as const satisfies Record<ChangeKind, "ok" | "err" | "warn">;
const TARGET = { kind: "architecture", id: "arch", label: "the architecture" };

export function ArchitectureView() {
  const plan = usePlan();
  const post = usePost();
  const asking = usePending("arch");
  const a = plan.architecture;
  const decidedSince = a ? plan.decisions.filter((d) => d.status === "decided" && d.at > a.at).length : 0;
  return (
    <div className={css.layout}>
      <Row>
        <Button kind="primary" disabled={asking} onClick={() => void post({ type: "arch.request" }, "arch")}>
          {a ? "Update the architecture" : "Map the architecture"}
        </Button>
        {decidedSince ? <Text tone="warn">{decidedSince} decision{decidedSince > 1 ? "s" : ""} since it was drawn</Text> : null}
      </Row>
      {a ? (
        <>
          <Panel>
            <Markdown text={a.summary} />
            <ArchDiffView before={a.current} after={a.target} changed={a.changed} />
          </Panel>
          <Panel>
            <h3>What changes, and why</h3>
            <table className={css.table}>
              <tbody>
                {a.changes.map((c) => (
                  <tr key={`${c.kind}:${c.component}`}>
                    <td>
                      <Badge tone={KIND_TONE[c.kind]}>{c.kind}</Badge>
                    </td>
                    <td className={css.component}>{c.component}</td>
                    <td>{c.note}</td>
                    <td className={css.refs}>
                      {c.decisions.map((d) => (
                        <button key={d} type="button" onClick={() => openNode(d)}>
                          {d}
                        </button>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
          <Panel>
            <SecondOpinion target={TARGET} opinions={plan.opinions} defaults={plan.reviewer} />
          </Panel>
        </>
      ) : (
        <EmptyState title="No architecture yet.">The agent reads the code and draws the current and target systems, naming the decisions behind each change.</EmptyState>
      )}
    </div>
  );
}
