// The findings list: the review's summary, batch actions on selected findings,
// then the findings grouped by triage bucket or severity.
import { useCallback, useMemo, useState } from "react";
import { BUCKET_LABEL, SEVERITIES, TRIAGE_BUCKETS, type Finding, type Severity, type TriageBucket } from "../../../../src/kit/findings.ts";
import { cx } from "../../../../web/kit/cx.ts";
import { FindingRow } from "../../../../web/kit/FindingRow.tsx";
import { useStoredState } from "../../../../web/kit/hooks/useStoredState.ts";
import { Badge, BUCKET_TONE, LEVEL_TONE, ROUND_TONE } from "../../../../web/kit/primitives/Badge.tsx";
import { Button } from "../../../../web/kit/primitives/Button.tsx";
import { Checkbox } from "../../../../web/kit/primitives/Checkbox.tsx";
import { EmptyState } from "../../../../web/kit/primitives/EmptyState.tsx";
import { Note } from "../../../../web/kit/primitives/Note.tsx";
import { Panel } from "../../../../web/kit/primitives/Panel.tsx";
import { Row } from "../../../../web/kit/primitives/Row.tsx";
import { Segmented } from "../../../../web/kit/primitives/Segmented.tsx";
import { Spacer } from "../../../../web/kit/primitives/Spacer.tsx";
import { Text } from "../../../../web/kit/primitives/Text.tsx";
import sev from "../../../../web/kit/Severity.module.css";
import { usePending } from "../../../../web/kit/store.ts";
import type { ChangeRequest, ReviewState } from "../state.ts";
import { FIX_LABEL, fixRequests, IN_HAND } from "./fixes.ts";
import { useGithub, useLive, usePost, useReview } from "./hooks.ts";
import css from "./ReviewTab.module.css";

type GroupBy = "triage" | "severity";
const GROUP_OPTIONS = [
  { id: "triage", label: "By triage" },
  { id: "severity", label: "By severity" },
] as const;
const BUCKET_CLASS = { "fix-now": css.fixNow, "fix-now-expands": css.fixNowExpands, defer: css.defer, skip: css.skip } satisfies Record<TriageBucket, string>;

interface Group {
  key: string;
  title: string;
  className: string;
  findings: Finding[];
}

const blocking = (s: Severity) => s === "Critical" || s === "High";
const selectRun = (s: ReviewState) => s.review;
const selectComments = (s: ReviewState) => s.comments;
const selectRequests = (s: ReviewState) => s.requests;

function groupsOf(findings: readonly Finding[], by: GroupBy): Group[] {
  if (by === "severity") {
    return SEVERITIES.map((s) => ({ key: s, title: `${s} ${blocking(s) ? "· blocking" : "· non-blocking"}`, className: sev[s], findings: findings.filter((f) => f.severity === s) }));
  }
  return [
    ...TRIAGE_BUCKETS.map((b) => ({ key: b, title: BUCKET_LABEL[b], className: BUCKET_CLASS[b], findings: findings.filter((f) => f.triage?.bucket === b) })),
    { key: "untriaged", title: "Untriaged", className: css.skip, findings: findings.filter((f) => !f.triage) },
  ];
}

/** How many shown findings have a fix applied, on its way, or none yet. */
function FixProgress({ fixes, shown }: { fixes: ReadonlyMap<string, ChangeRequest>; shown: readonly Finding[] }) {
  const statuses = shown.map((f) => fixes.get(f.id)?.status);
  const fixed = statuses.filter((s) => s === "done").length;
  const moving = statuses.filter((s) => s === "pending" || s === "sent").length;
  const stuck = statuses.filter((s) => s === "declined" || s === "needs-input").length;
  return (
    <div className={css.sumRow}>
      <Badge tone="ok">{fixed} fixed</Badge>
      {moving ? <Badge tone="info">{moving} in progress</Badge> : null}
      {stuck ? <Badge tone="warn">{stuck} declined or waiting on you</Badge> : null}
      <Text tone="faint">{shown.length - fixed - moving - stuck} not requested</Text>
    </div>
  );
}

function Summary({ fixes }: { fixes: ReadonlyMap<string, ChangeRequest> }) {
  const run = useReview(selectRun);
  const live = useLive();
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
      <div className={css.sumRow}>
        {TRIAGE_BUCKETS.map((b) => {
          const n = shown.filter((f) => f.triage?.bucket === b).length;
          return n ? (
            <Badge key={b} tone={BUCKET_TONE[b]}>
              {n} {BUCKET_LABEL[b].toLowerCase()}
            </Badge>
          ) : null;
        })}
      </div>
      {live ? <FixProgress fixes={fixes} shown={shown} /> : null}
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
  const requests = useReview(selectRequests);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [showDismissed, setShowDismissed] = useState(false);
  const [hideFixed, setHideFixed] = useState(false);
  const [groupBy, setGroupBy] = useStoredState<GroupBy>("review.groupBy", "triage");
  const [instruction, setInstruction] = useState("");
  const drafting = usePending("auto");
  const requesting = usePending("freq");
  const fixes = useMemo(() => fixRequests(run.findings, requests), [run.findings, requests]);
  const isFixed = (f: Finding) => fixes.get(f.id)?.status === "done";
  const findings = run.findings.filter((f) => (showDismissed || !f.dismissed) && !(hideFixed && isFixed(f)));
  // Select-all leaves out findings whose fix is applied or on its way, so a batch never asks twice.
  const inHand = (f: Finding) => {
    const status = fixes.get(f.id)?.status;
    return status !== undefined && IN_HAND.has(status);
  };
  const open = (list: readonly Finding[]) => list.filter((f) => !f.dismissed && !inHand(f));
  const selectable = open(findings);
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
  const selectGroup = (list: readonly Finding[]) => setSelected((prev) => new Set([...prev, ...open(list).map((f) => f.id)]));
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
    live ? "Change requests: one per finding, added to your batch to edit and send. Select all skips findings already fixed or queued." : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={css.list}>
      <Summary fixes={fixes} />
      <Panel>
        <Row flush>
          <Checkbox checked={all} onChange={() => setSelected(all ? new Set() : new Set(selectable.map((f) => f.id)))}>
            {chosen.length} selected
          </Checkbox>
          <Spacer />
          {live ? (
            <Checkbox checked={hideFixed} onChange={setHideFixed}>
              <Text tone="faint">hide fixed</Text>
            </Checkbox>
          ) : null}
          <Checkbox checked={showDismissed} onChange={setShowDismissed}>
            <Text tone="faint">show dismissed</Text>
          </Checkbox>
        </Row>
        <Row>
          <Segmented options={GROUP_OPTIONS} value={groupBy} onChange={setGroupBy} />
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
      {groupsOf(findings, groupBy).map((g) => {
        if (!g.findings.length) {
          return null;
        }
        const pickable = open(g.findings).length;
        return (
          <section key={g.key}>
            <h3 className={cx(css.groupHead, g.className)}>
              <span>
                {g.title} · {g.findings.length}
              </span>
              {pickable ? (
                <button type="button" className={css.groupPick} onClick={() => selectGroup(g.findings)}>
                  select {pickable}
                </button>
              ) : null}
            </h3>
            {g.findings.map((f) => {
              const drafted = comments.filter((c) => c.origin.kind === "finding" && c.origin.findingId === f.id);
              const fix = fixes.get(f.id);
              return (
                <FindingRow
                  key={f.id}
                  finding={f}
                  on={active === f.id}
                  selected={selected.has(f.id)}
                  onToggle={onToggle}
                  onOpen={onOpen}
                  resolved={fix?.status === "done"}
                  status={fix ? <Badge tone={ROUND_TONE[fix.status]}>{FIX_LABEL[fix.status]}</Badge> : undefined}
                  meta={
                    <>
                      {groupBy === "triage" ? (
                        <Badge mini severity={f.severity}>
                          {f.severity}
                        </Badge>
                      ) : null}
                      {groupBy === "severity" && f.triage ? (
                        <Badge mini tone={BUCKET_TONE[f.triage.bucket]}>
                          {BUCKET_LABEL[f.triage.bucket]}
                        </Badge>
                      ) : null}
                      {f.triage ? <Badge mini>{f.triage.fixSize} fix</Badge> : null}
                      {drafted.length ? <Badge mini>💬 {drafted.map((c) => `${c.id} ${c.status}`).join(", ")}</Badge> : null}
                    </>
                  }
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
