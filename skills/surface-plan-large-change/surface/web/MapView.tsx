// The Map tab: the destination and its edges, the questions in the way as a
// graph colored by state, the fog still ahead, and the frontier to work next.
import { useMemo, useState } from "react";
import type { Graph, GraphTone } from "../../../../src/kit/code.ts";
import { GraphView } from "../../../../web/kit/GraphView.tsx";
import { Markdown } from "../../../../web/kit/Markdown.tsx";
import { AskRow } from "../../../../web/kit/primitives/AskRow.tsx";
import { Badge } from "../../../../web/kit/primitives/Badge.tsx";
import { Button } from "../../../../web/kit/primitives/Button.tsx";
import { Panel } from "../../../../web/kit/primitives/Panel.tsx";
import { Row } from "../../../../web/kit/primitives/Row.tsx";
import { Text } from "../../../../web/kit/primitives/Text.tsx";
import { SecondOpinion } from "../../../../web/kit/SecondOpinion.tsx";
import { frontier, isBlocked, type Plan, type PlanNode } from "../state.ts";
import { usePlan, usePost } from "./hooks.ts";
import css from "./MapView.module.css";
import { openNode } from "./nav.ts";

const MAP_TARGET = { kind: "map", id: "map", label: "the map" };

export function toneOf(plan: Plan, node: PlanNode): GraphTone {
  if (node.status === "decided") {
    return "done";
  }
  if (node.status === "deferred") {
    return "muted";
  }
  if (isBlocked(plan, node)) {
    return "blocked";
  }
  return node.run?.status === "running" ? "active" : "open";
}

/** The map as a graph: blockers point at what they block; fog floats unattached. */
export function mapGraph(plan: Plan): Graph {
  return {
    nodes: [
      ...plan.nodes.map((n) => ({ id: n.id, label: `${n.id} ${n.title}`, group: n.type, tone: toneOf(plan, n), note: `${n.type} · ${n.mode}` })),
      ...plan.fog.filter((f) => !f.graduatedTo).map((f) => ({ id: f.id, label: `${f.id} ${f.text}`, group: "~fog", tone: "fog" as const, note: "fog: not yet phrased as a question" })),
    ],
    edges: plan.nodes.flatMap((n) => n.blockedBy.map((b) => ({ from: b, to: n.id }))),
  };
}

function Destination({ plan }: { plan: Plan }) {
  const post = usePost();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(plan.destination);
  const save = async () => {
    if (await post({ type: "scope.edit", destination: text }, "destination")) {
      setEditing(false);
    }
  };
  return (
    <Panel>
      <h3>Destination</h3>
      {editing ? (
        <>
          <textarea className={css.text} rows={3} value={text} onChange={(e) => setText(e.target.value)} />
          <Row end>
            <Button onClick={() => setEditing(false)}>Cancel</Button>
            <Button kind="primary" onClick={() => void save()}>
              Save
            </Button>
          </Row>
        </>
      ) : (
        <div className={css.destination}>
          {plan.destination ? <Markdown text={plan.destination} /> : <Text tone="faint">Not named yet. Name it before the first node: it fixes the scope everything is measured against.</Text>}
          <Button
            size="small"
            kind="ghost"
            onClick={() => {
              setText(plan.destination);
              setEditing(true);
            }}
          >
            Edit
          </Button>
        </div>
      )}
    </Panel>
  );
}

function Edges({ plan }: { plan: Plan }) {
  const post = usePost();
  const fog = plan.fog.filter((f) => !f.graduatedTo);
  return (
    <div className={css.edges}>
      <Panel>
        <h3>Not yet specified (fog)</h3>
        {fog.length ? null : <Text tone="faint">No fog: every question ahead can be asked.</Text>}
        <ul className={css.list}>
          {fog.map((f) => (
            <li key={f.id}>
              <b>{f.id}</b> {f.text}
              <span className={css.actions}>
                <Button size="small" title="Ask the agent to phrase it as a question" onClick={() => void post({ type: "fog.clarify", fogId: f.id })}>
                  Clarify
                </Button>
                <Button size="small" kind="ghost" title="Remove" onClick={() => void post({ type: "scope.edit", removeFog: f.id })}>
                  ×
                </Button>
              </span>
            </li>
          ))}
        </ul>
        <AskRow placeholder="Add something you can see coming" label="Add" pendingKey="fog-add" onSend={(text) => post({ type: "scope.edit", addFog: text }, "fog-add")} />
      </Panel>
      <Panel>
        <h3>Out of scope</h3>
        {plan.outOfScope.length ? null : <Text tone="faint">Nothing named.</Text>}
        <ul className={css.list}>
          {plan.outOfScope.map((item, i) => (
            <li key={`${i}:${item}`}>
              {item}
              <span className={css.actions}>
                <Button size="small" kind="ghost" title="Remove" onClick={() => void post({ type: "scope.edit", removeOutOfScope: i })}>
                  ×
                </Button>
              </span>
            </li>
          ))}
        </ul>
        <AskRow placeholder="Add work beyond the destination" label="Add" pendingKey="scope-add" onSend={(text) => post({ type: "scope.edit", addOutOfScope: text }, "scope-add")} />
      </Panel>
    </div>
  );
}

export function MapView() {
  const plan = usePlan();
  const post = usePost();
  const graph = useMemo(() => mapGraph(plan), [plan]);
  const open = frontier(plan);
  const decided = plan.decisions.filter((d) => d.status === "decided").length;
  return (
    <div className={css.layout}>
      <Destination plan={plan} />
      <Panel>
        <div className={css.head}>
          <h3>Map</h3>
          <Text tone="faint" small>
            {plan.nodes.length} questions · {decided} decided · {open.length} on the frontier · click a node to work it
          </Text>
          <span className={css.legend}>
            <Badge tone="amber">frontier</Badge>
            <Badge tone="info">running</Badge>
            <Badge>blocked</Badge>
            <Badge tone="ok">decided</Badge>
            <Badge tone="muted">fog</Badge>
          </span>
        </div>
        {plan.nodes.length || graph.nodes.length ? <GraphView graph={graph} onNode={(id) => (id.startsWith("N") ? openNode(id) : undefined)} /> : <Text tone="faint">No questions yet. The agent charts them once the destination is named.</Text>}
      </Panel>
      <Panel>
        <div className={css.head}>
          <h3>Frontier</h3>
          <Button kind="primary" onClick={() => void post({ type: "map.next" }, "map-next")}>
            Work the frontier
          </Button>
        </div>
        {open.length ? null : <Text tone="faint">Nothing open and unblocked.</Text>}
        <ul className={css.list}>
          {open.map((n) => (
            <li key={n.id}>
              <button type="button" className={css.link} onClick={() => openNode(n.id)}>
                <b>{n.id}</b> {n.title}
              </button>
              <span className={css.actions}>
                <Badge>{n.type}</Badge>
                <Badge tone={n.mode === "AFK" ? "info" : "amber"}>{n.mode}</Badge>
                {n.run?.status === "running" ? <Badge tone="info">running</Badge> : null}
                {n.choice ? <Badge tone="ok">options ready</Badge> : null}
              </span>
            </li>
          ))}
        </ul>
      </Panel>
      <Edges plan={plan} />
      <Panel>
        <SecondOpinion target={MAP_TARGET} opinions={plan.opinions} defaults={plan.reviewer} />
      </Panel>
    </div>
  );
}
