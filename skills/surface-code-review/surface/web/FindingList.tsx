// The findings list: the review's summary, batch actions on selected findings,
// then the findings grouped by severity.
import { useCallback, useState } from "react";
import { SEVERITIES, type Severity } from "../../../../src/kit/findings.ts";
import { cx } from "../../../../web/kit/cx.ts";
import { FindingRow } from "../../../../web/kit/FindingRow.tsx";
import { Badge, LEVEL_TONE } from "../../../../web/kit/primitives/Badge.tsx";
import { Button } from "../../../../web/kit/primitives/Button.tsx";
import { Checkbox } from "../../../../web/kit/primitives/Checkbox.tsx";
import { EmptyState } from "../../../../web/kit/primitives/EmptyState.tsx";
import { Note } from "../../../../web/kit/primitives/Note.tsx";
import { Panel } from "../../../../web/kit/primitives/Panel.tsx";
import { Row } from "../../../../web/kit/primitives/Row.tsx";
import { Spacer } from "../../../../web/kit/primitives/Spacer.tsx";
import { Text } from "../../../../web/kit/primitives/Text.tsx";
import sev from "../../../../web/kit/Severity.module.css";
import { usePending } from "../../../../web/kit/store.ts";
import type { ReviewState } from "../state.ts";
import { useGithub, useLive, usePost, useReview } from "./hooks.ts";
import css from "./ReviewTab.module.css";

const blocking = (s: Severity) => s === "Critical" || s === "High";
const selectRun = (s: ReviewState) => s.review;
const selectComments = (s: ReviewState) => s.comments;

function Summary() {
  const run = useReview(selectRun);
  if (!run.summary) {
    return null;
  }
  const shown = run.findings.filter((f) => !f.dismissed);
  return (
    <Panel>
      <div className={css.sumRow}>
        <Badge tone={LEVEL_TONE[run.summary.risk]}>Risk: {run.summary.risk}</Badge>
        {SEVERITIES.map((s) => {
          const n = shown.filter((f) => f.severity === s).length;
          return n ? (
            <Badge key={s} severity={s}>
              {n} {s}
            </Badge>
          ) : null;
        })}
        <Text tone="faint">{shown.filter((f) => blocking(f.severity)).length} blocking</Text>
      </div>
      <Text tone="faint" mono small>
        {run.summary.scope}
      </Text>
      <div className={css.intent}>
        <b>Intent.</b> {run.summary.intent}
      </div>
    </Panel>
  );
}

export function FindingList({ active, onOpen }: { active: string | undefined; onOpen(id: string): void }) {
  const post = usePost();
  const live = useLive();
  const github = useGithub();
  const run = useReview(selectRun);
  const comments = useReview(selectComments);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [showDismissed, setShowDismissed] = useState(false);
  const [instruction, setInstruction] = useState("");
  const drafting = usePending("auto");
  const requesting = usePending("freq");
  const findings = run.findings.filter((f) => showDismissed || !f.dismissed);
  const selectable = findings.filter((f) => !f.dismissed);
  const all = selectable.length > 0 && selectable.every((f) => selected.has(f.id));
  const chosen = run.findings.filter((f) => selected.has(f.id) && !f.dismissed).map((f) => f.id);
  const onToggle = useCallback(
    (id: string) =>
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      }),
    [],
  );
  const draftAll = async () => {
    const ok = await post({ type: "findings.autoComment", findingIds: chosen, instruction }, "auto");
    if (ok) {
      setSelected(new Set());
    }
  };
  const requestAll = async () => {
    if (await post({ type: "findings.request", findingIds: chosen }, "freq")) {
      setSelected(new Set());
    }
  };
  const note = [
    github ? "Draft comments: the agent writes one per finding, and nothing reaches GitHub until you click Post." : "",
    live ? "Change requests: one per finding, added to your batch to edit and send." : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={css.list}>
      <Summary />
      <Panel>
        <Row flush>
          <Checkbox checked={all} onChange={() => setSelected(all ? new Set() : new Set(selectable.map((f) => f.id)))}>
            {chosen.length} selected
          </Checkbox>
          <Spacer />
          <Checkbox checked={showDismissed} onChange={setShowDismissed}>
            <Text tone="faint">show dismissed</Text>
          </Checkbox>
        </Row>
        {github ? (
          <Row>
            <input placeholder="Optional note for the agent, e.g. one sentence each" value={instruction} onChange={(e) => setInstruction(e.target.value)} />
          </Row>
        ) : null}
        <Row end>
          {github ? (
            <Button kind={live ? "plain" : "primary"} disabled={!chosen.length || drafting} onClick={() => void draftAll()}>
              ✦ Draft comments ({chosen.length})
            </Button>
          ) : null}
          {live ? (
            <Button kind="primary" disabled={!chosen.length || requesting} onClick={() => void requestAll()}>
              Make change requests ({chosen.length})
            </Button>
          ) : null}
        </Row>
        {note ? <Note>{note}</Note> : null}
      </Panel>
      {SEVERITIES.map((s) => {
        const group = findings.filter((f) => f.severity === s);
        if (!group.length) {
          return null;
        }
        return (
          <section key={s}>
            <h3 className={cx(css.sevHead, sev[s])}>
              {s} {blocking(s) ? "· blocking" : "· non-blocking"}
            </h3>
            {group.map((f) => {
              const drafted = comments.filter((c) => c.origin.kind === "finding" && c.origin.findingId === f.id);
              return (
                <FindingRow
                  key={f.id}
                  finding={f}
                  on={active === f.id}
                  selected={selected.has(f.id)}
                  onToggle={onToggle}
                  onOpen={onOpen}
                  meta={drafted.length ? <Badge mini>💬 {drafted.map((c) => `${c.id} ${c.status}`).join(", ")}</Badge> : undefined}
                />
              );
            })}
          </section>
        );
      })}
      {run.status === "done" && run.findings.length === 0 ? <EmptyState small title="No issues found." /> : null}
      {run.disagreements.length ? (
        <details className={css.details}>
          <summary>Disagreements ({run.disagreements.length})</summary>
          <ul>
            {run.disagreements.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </details>
      ) : null}
      {run.dropped.length ? (
        <details className={css.details}>
          <summary>Dropped in verification ({run.dropped.length})</summary>
          <ul>
            {run.dropped.map((d) => (
              <li key={`${d.lens}:${d.title}`}>
                <b>{d.severity}</b> {d.title} <Text tone="faint">({d.lens})</Text>. {d.reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
