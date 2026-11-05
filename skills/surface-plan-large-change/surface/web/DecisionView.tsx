// The Decision tab: one node at a time. Its options compared by lens with
// their trade-offs, its findings, its checklist, and what deciding it unblocks.
import { useState } from "react";
import type { OptionSet } from "../../../../src/kit/options.ts";
import { ChatThread } from "../../../../web/kit/ChatThread.tsx";
import { cx } from "../../../../web/kit/cx.ts";
import { useHashState } from "../../../../web/kit/hooks/useHashState.ts";
import { Markdown } from "../../../../web/kit/Markdown.tsx";
import { OPTION_COLORS, OptionCard } from "../../../../web/kit/OptionCard.tsx";
import { AskRow } from "../../../../web/kit/primitives/AskRow.tsx";
import { Badge } from "../../../../web/kit/primitives/Badge.tsx";
import { Banner } from "../../../../web/kit/primitives/Banner.tsx";
import { Button } from "../../../../web/kit/primitives/Button.tsx";
import { Checkbox } from "../../../../web/kit/primitives/Checkbox.tsx";
import { EmptyState } from "../../../../web/kit/primitives/EmptyState.tsx";
import { Panel } from "../../../../web/kit/primitives/Panel.tsx";
import { Row } from "../../../../web/kit/primitives/Row.tsx";
import { Segmented } from "../../../../web/kit/primitives/Segmented.tsx";
import { Text } from "../../../../web/kit/primitives/Text.tsx";
import { Working } from "../../../../web/kit/primitives/Working.tsx";
import { Radar } from "../../../../web/kit/Radar.tsx";
import { ScoreTable } from "../../../../web/kit/ScoreTable.tsx";
import { SecondOpinion } from "../../../../web/kit/SecondOpinion.tsx";
import { Visuals } from "../../../../web/kit/Visuals.tsx";
import { dependents, frontier, isBlocked, type Plan, type PlanNode } from "../state.ts";
import css from "./DecisionView.module.css";
import { usePlan, usePost } from "./hooks.ts";
import { toneOf } from "./MapView.tsx";
import { openNode } from "./nav.ts";

const colorOf = (i: number) => OPTION_COLORS[i % OPTION_COLORS.length];

function Switcher({ plan, current }: { plan: Plan; current: string }) {
  return (
    <div className={css.switch}>
      {plan.nodes.map((n) => (
        <button key={n.id} type="button" className={cx(css.chip, css[toneOf(plan, n)], n.id === current && css.on)} title={n.title} onClick={() => openNode(n.id)}>
          {n.id}
        </button>
      ))}
    </div>
  );
}

function Settled({ plan, node }: { plan: Plan; node: PlanNode }) {
  const post = usePost();
  const decision = plan.decisions.find((d) => d.nodeId === node.id);
  const down = dependents(plan, node.id);
  return (
    <Banner tone={node.status === "decided" ? "done" : "info"}>
      <span>
        {node.status === "decided" ? (
          <>
            Decided: <b>{decision?.label}</b>
            {decision?.overrodeRecommendation ? <Badge tone="link">override</Badge> : null}
            {decision?.note ? ` · ${decision.note}` : ""}
          </>
        ) : (
          "Deferred"
        )}
        {down.nodes.length || down.slices.length ? <Text tone="faint"> · downstream: {[...down.nodes, ...down.slices].join(", ")}</Text> : null}
      </span>
      <Button size="small" onClick={() => void post({ type: "node.reopen", nodeId: node.id })}>
        Reopen
      </Button>
    </Banner>
  );
}

function Options({ node, choice, locked }: { node: PlanNode; choice: OptionSet; locked: boolean }) {
  const post = usePost();
  const plan = usePlan();
  const decision = plan.decisions.find((d) => d.nodeId === node.id && d.status === "decided");
  const [lensId, setLens] = useState(choice.lenses[0]?.id ?? "");
  const [picked, setPicked] = useState<string>();
  const [note, setNote] = useState("");
  const lens = choice.lenses.find((l) => l.id === lensId) ?? choice.lenses[0];
  const selectedId = picked ?? decision?.optionId ?? (choice.options.find((o) => o.recommended) ?? choice.options[0]).id;
  const selectedIndex = Math.max(0, choice.options.findIndex((o) => o.id === selectedId));
  const series = choice.options.map((o, i) => ({ color: colorOf(i), on: o.id === selectedId, values: choice.dimensions.map((d) => o.scores[d.id]?.value ?? 0) }));
  const blocked = isBlocked(plan, node);
  return (
    <div className={css.grid}>
      <div>
        {choice.lenses.length > 1 ? (
          <Row>
            <Text tone="faint" small>
              Compare by
            </Text>
            <Segmented options={choice.lenses.map((l) => ({ id: l.id, label: l.label }))} value={lens.id} onChange={setLens} />
          </Row>
        ) : null}
        {choice.options.map((o, i) => (
          <OptionCard
            key={o.id}
            option={o}
            lens={lens}
            color={colorOf(i)}
            selected={o.id === selectedId}
            locked={locked}
            chosen={decision?.optionId === o.id}
            onSelect={(id) => (locked ? undefined : setPicked(id))}
          />
        ))}
        {locked ? null : (
          <div className={css.decide}>
            <input placeholder="Optional note: why this one" value={note} onChange={(e) => setNote(e.target.value)} />
            <Button onClick={() => void post({ type: "node.defer", nodeId: node.id })}>Defer</Button>
            <Button kind="primary" disabled={blocked} title={blocked ? "Decide what it waits on first" : undefined} onClick={() => void post({ type: "node.decide", nodeId: node.id, optionId: selectedId, note }, `decide:${node.id}`)}>
              Decide: {choice.options[selectedIndex].label}
            </Button>
          </div>
        )}
      </div>
      {choice.dimensions.length ? (
        <Panel>
          <h3>Trade-offs</h3>
          <Text tone="faint" small>
            5 is best on every row; further out is better.
          </Text>
          <div className={css.tradeoffs}>
            {choice.dimensions.length >= 3 ? <Radar dims={choice.dimensions.map((d) => d.label)} series={series} /> : null}
            <ScoreTable dimensions={choice.dimensions} option={choice.options[selectedIndex]} color={colorOf(selectedIndex)} />
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

function DecideInWords({ node }: { node: PlanNode }) {
  const post = usePost();
  const plan = usePlan();
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const task = node.type === "task";
  const unchecked = node.checklist?.some((c) => !c.done) ?? false;
  return (
    <Panel>
      {node.checklist?.length ? (
        <>
          <h3>Steps</h3>
          {node.checklist.map((c, i) => (
            <Checkbox key={c.text} checked={c.done} onChange={(done) => void post({ type: "node.check", nodeId: node.id, index: i, done })}>
              {c.text}
            </Checkbox>
          ))}
        </>
      ) : null}
      <h3>{task ? "Done?" : "Decide"}</h3>
      {task ? null : <textarea className={css.text} rows={2} placeholder="What was decided, in a sentence" value={text} onChange={(e) => setText(e.target.value)} />}
      <div className={css.decide}>
        <input placeholder="Optional note" value={note} onChange={(e) => setNote(e.target.value)} />
        <Button onClick={() => void post({ type: "node.defer", nodeId: node.id })}>Defer</Button>
        <Button
          kind="primary"
          disabled={isBlocked(plan, node) || unchecked || (!task && !text.trim())}
          onClick={() => void post({ type: "node.decide", nodeId: node.id, text: task ? undefined : text, note }, `decide:${node.id}`)}
        >
          {task ? "Mark done" : "Decide"}
        </Button>
      </div>
    </Panel>
  );
}

function Work({ node }: { node: PlanNode }) {
  const post = usePost();
  const [focus, setFocus] = useState("");
  const kinds = [
    ...(node.type === "discuss" && !node.choice ? [["options", "Ask for options"] as const] : []),
    ["deeper", "Go deeper"] as const,
    ["research", "Research this"] as const,
    ["spike", "Spike this"] as const,
  ];
  return (
    <Row>
      <input className={css.focus} placeholder="Optional focus for the agent" value={focus} onChange={(e) => setFocus(e.target.value)} />
      {kinds.map(([kind, label]) => (
        <Button key={kind} size="small" onClick={() => void post({ type: "node.work", nodeId: node.id, kind, focus }, `work:${node.id}`)}>
          {label}
        </Button>
      ))}
    </Row>
  );
}

function Run({ node }: { node: PlanNode }) {
  const run = node.run;
  if (!run) {
    return null;
  }
  return (
    <div className={css.run}>
      {run.status === "running" ? <Working>AFK run in progress{run.note ? `: ${run.note}` : ""}</Working> : null}
      {run.status === "failed" ? <Banner tone="err">Run failed{run.note ? `: ${run.note}` : ""}</Banner> : null}
      {run.status === "done" && run.note ? <Text tone="faint">{run.note}</Text> : null}
      {run.worktrees.length ? (
        <Text tone="faint" small mono>
          worktrees: {run.worktrees.join(", ")}
        </Text>
      ) : null}
    </div>
  );
}

export function DecisionView() {
  const plan = usePlan();
  const post = usePost();
  const [nodeParam] = useHashState("node", "");
  const node = plan.nodes.find((n) => n.id === nodeParam) ?? frontier(plan)[0] ?? plan.nodes.at(-1);
  if (!node) {
    return <EmptyState title="No questions yet.">The agent charts the map once the destination is named.</EmptyState>;
  }
  const locked = node.status !== "open";
  const waiting = node.blockedBy.filter((b) => plan.nodes.find((n) => n.id === b)?.status !== "decided");
  return (
    <div className={css.layout}>
      <Switcher plan={plan} current={node.id} />
      <h2 className={css.title}>
        <span className={css.id}>{node.id}</span> {node.title}
      </h2>
      <Row>
        <Badge>{node.type}</Badge>
        <Badge tone={node.mode === "AFK" ? "info" : "amber"}>{node.mode}</Badge>
        {node.fromFog ? <Badge tone="muted">from {node.fromFog}</Badge> : null}
        {waiting.length ? (
          <Text tone="warn" small>
            waits on{" "}
            {waiting.map((b) => (
              <button key={b} type="button" className={css.ref} onClick={() => openNode(b)}>
                {b}
              </button>
            ))}
          </Text>
        ) : null}
      </Row>
      {node.summary ? <Markdown text={node.summary} /> : null}
      {locked ? <Settled plan={plan} node={node} /> : null}
      <Run node={node} />
      {node.result ? (
        <Panel>
          <h3>Findings</h3>
          <Markdown text={node.result.markdown} />
          {node.result.visuals.length ? <Visuals visuals={node.result.visuals} /> : null}
        </Panel>
      ) : null}
      {node.visuals.length ? <Visuals key={node.id} visuals={node.visuals} /> : null}
      {node.choice ? <Options key={node.id} node={node} choice={node.choice} locked={locked} /> : null}
      {!node.choice && !locked ? <DecideInWords key={node.id} node={node} /> : null}
      {locked ? null : <Work node={node} />}
      <Panel>
        <h3>Discuss</h3>
        <ChatThread messages={node.thread} />
        <AskRow key={node.id} placeholder="Ask the agent about this question" pendingKey={`ask:${node.id}`} onSend={(text) => post({ type: "node.ask", nodeId: node.id, text }, `ask:${node.id}`)} />
      </Panel>
      <Panel>
        <SecondOpinion target={{ kind: "node", id: node.id, label: `${node.id} ${node.title}` }} opinions={plan.opinions} defaults={plan.reviewer} />
      </Panel>
    </div>
  );
}
