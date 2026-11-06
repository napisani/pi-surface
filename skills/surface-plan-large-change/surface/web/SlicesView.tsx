// The Slices tab: the units of delivery, how they depend on each other, the
// briefs they are built from, and what the sessions building them report back.
import { useMemo } from "react";
import type { Graph, GraphTone } from "../../../../src/kit/code.ts";
import { GraphView } from "../../../../web/kit/GraphView.tsx";
import { Badge } from "../../../../web/kit/primitives/Badge.tsx";
import { Banner } from "../../../../web/kit/primitives/Banner.tsx";
import { Button } from "../../../../web/kit/primitives/Button.tsx";
import { EmptyState } from "../../../../web/kit/primitives/EmptyState.tsx";
import { Panel } from "../../../../web/kit/primitives/Panel.tsx";
import { Row } from "../../../../web/kit/primitives/Row.tsx";
import { Text } from "../../../../web/kit/primitives/Text.tsx";
import { RichDoc } from "../../../../web/kit/RichDoc.tsx";
import { SecondOpinion } from "../../../../web/kit/SecondOpinion.tsx";
import { usePending } from "../../../../web/kit/store.ts";
import { SLICE_STATUSES, type Plan, type Slice, type SliceStatus } from "../state.ts";
import { usePlan, usePost } from "./hooks.ts";
import { openNode } from "./nav.ts";
import css from "./SlicesView.module.css";

const STATUS_TONE = { proposed: "open", ready: "open", "in-progress": "active", done: "done", blocked: "bad" } satisfies Record<SliceStatus, GraphTone>;
const TARGET = { kind: "slices", id: "all", label: "the slice breakdown" };

const sliceGraph = (plan: Plan): Graph => ({
  nodes: plan.slices.map((s) => ({ id: s.id, label: `${s.id} ${s.title}`, tone: STATUS_TONE[s.status], note: `${s.size} · ${s.mode} · ${s.status}` })),
  edges: plan.slices.flatMap((s) => s.dependsOn.map((d) => ({ from: d, to: s.id }))),
});

function SliceCard({ slice: s, plan }: { slice: Slice; plan: Plan }) {
  const post = usePost();
  const reports = plan.reports.filter((p) => p.sliceId === s.id);
  return (
    <div id={`slice-${s.id}`} className={css.card}>
      <div className={css.head}>
        <b className={css.id}>{s.id}</b>
        <span className={css.title}>{s.title}</span>
        <Badge>{s.size}</Badge>
        <Badge tone={s.mode === "AFK" ? "info" : "amber"}>{s.mode}</Badge>
        <select
          value={s.status}
          onChange={(e) => {
            const status = SLICE_STATUSES.find((st) => st === e.target.value);
            if (status) {
              void post({ type: "slice.status", sliceId: s.id, status });
            }
          }}
        >
          {SLICE_STATUSES.map((st) => (
            <option key={st} value={st}>
              {st}
            </option>
          ))}
        </select>
      </div>
      <div className={css.deliverable}>{s.deliverable}</div>
      <ul className={css.acceptance}>
        {s.acceptance.map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>
      <Row>
        {s.dependsOn.length ? <Text tone="faint" small>after {s.dependsOn.join(", ")}</Text> : null}
        {s.touches.length ? (
          <Text tone="faint" small mono>
            {s.touches.join(" · ")}
          </Text>
        ) : null}
        {s.decisions.map((d) => (
          <button key={d} type="button" className={css.ref} onClick={() => openNode(d)}>
            {d}
          </button>
        ))}
      </Row>
      <details>
        <summary>Brief{s.comments?.some((c) => c.status === "pending" || c.status === "needs-input") ? " · comments waiting" : ""}</summary>
        <RichDoc doc={{ kind: "slice", id: s.id, label: `the brief for ${s.id}` }} markdown={s.brief} comments={s.comments ?? []} editable />
      </details>
      {reports.map((p) => (
        <Banner key={p.id} tone={p.status === "blocked" || p.deviations.length ? "warn" : "info"}>
          <span>
            <b>
              {p.id} · {p.status}
            </b>{" "}
            {p.note}
            {p.deviations.map((d) => (
              <span key={d.text} className={css.deviation}>
                ⚠ {d.text}
                {d.nodes.length ? ` (${d.nodes.join(", ")})` : ""}
              </span>
            ))}
          </span>
          {p.acknowledged ? null : (
            <Button size="small" onClick={() => void post({ type: "report.ack", reportId: p.id })}>
              Seen
            </Button>
          )}
        </Banner>
      ))}
      <Row end>
        {s.forgeSpec ? (
          <Text tone="faint" small mono>
            spec: {s.forgeSpec}
          </Text>
        ) : null}
        <Button size="small" title="Design this slice in a forge session, with the plan's decisions locked" onClick={() => void post({ type: "slice.forge", sliceId: s.id }, `forge:${s.id}`)}>
          Design in forge
        </Button>
        <Button size="small" onClick={() => void navigator.clipboard.writeText(s.brief)}>
          Copy brief
        </Button>
      </Row>
    </div>
  );
}

function Approval({ plan }: { plan: Plan }) {
  const post = usePost();
  if (plan.slicesApprovedAt) {
    return <Badge tone="ok">approved</Badge>;
  }
  return (
    <Button kind="primary" onClick={() => void post({ type: "slices.approve" }, "approve")}>
      Approve slices
    </Button>
  );
}

export function SlicesView() {
  const plan = usePlan();
  const post = usePost();
  const asking = usePending("slices");
  const graph = useMemo(() => sliceGraph(plan), [plan]);
  const unseen = plan.reports.filter((p) => !p.acknowledged).length;
  return (
    <div className={css.layout}>
      <Row>
        <Button kind={plan.slices.length ? "plain" : "primary"} disabled={asking} onClick={() => void post({ type: "slices.request" }, "slices")}>
          {plan.slices.length ? "Revise the slices" : "Break it into slices"}
        </Button>
        {plan.slices.length ? <Approval plan={plan} /> : null}
        {unseen ? <Badge tone="warn">{unseen} new report{unseen > 1 ? "s" : ""}</Badge> : null}
      </Row>
      {plan.slices.length ? (
        <>
          <Panel>
            <GraphView graph={graph} onNode={(id) => document.getElementById(`slice-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })} />
          </Panel>
          {plan.slices.map((s) => (
            <SliceCard key={s.id} slice={s} plan={plan} />
          ))}
          <Panel>
            <SecondOpinion target={TARGET} opinions={plan.opinions} defaults={plan.reviewer} />
          </Panel>
        </>
      ) : (
        <EmptyState title="Not broken down yet.">Once the frontier is clear, the agent proposes slices small enough to build and review one at a time.</EmptyState>
      )}
    </div>
  );
}
