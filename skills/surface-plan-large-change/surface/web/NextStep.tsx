// What to do next on an open question, said plainly with the right button first:
// start the agent's research or spike, wait for it, have it propose a decision
// from what it found, pick an option, or decide in words.
import { useState, type ReactNode } from "react";
import { cx } from "../../../../web/kit/cx.ts";
import { Button } from "../../../../web/kit/primitives/Button.tsx";
import { Checkbox } from "../../../../web/kit/primitives/Checkbox.tsx";
import { Panel } from "../../../../web/kit/primitives/Panel.tsx";
import { Working } from "../../../../web/kit/primitives/Working.tsx";
import { usePending } from "../../../../web/kit/store.ts";
import { isBlocked, type Plan, type PlanNode, type WorkKind } from "../state.ts";
import { usePlan, usePost } from "./hooks.ts";
import { nextStep, openBlockers, type Step } from "./navigator.ts";
import { openNode } from "./nav.ts";
import css from "./NextStep.module.css";

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


/** Optional instructions, then the request that wakes the agent. */
function Ask({ node, kind, label, placeholder, primary = true }: { node: PlanNode; kind: WorkKind; label: string; placeholder: string; primary?: boolean }) {
  const post = usePost();
  const [focus, setFocus] = useState("");
  const busy = usePending(`work:${node.id}`);
  return (
    <div className={css.ask}>
      <textarea rows={2} placeholder={placeholder} value={focus} onChange={(e) => setFocus(e.target.value)} />
      <Button kind={primary ? "primary" : "plain"} disabled={busy} onClick={() => void post({ type: "node.work", nodeId: node.id, kind, focus }, `work:${node.id}`)}>
        {label}
      </Button>
    </div>
  );
}

const STEP_TITLE = {
  blocked: "Next: decide what this waits on",
  working: "The agent is on it",
  start: "Next: start the agent",
  findings: "Next: turn the findings into a decision",
  choose: "Next: pick an option",
  ask: "Next: get options to choose from",
  task: "Next: do the steps, then mark it done",
} satisfies Record<Step, string>;

interface StepProps {
  plan: Plan;
  node: PlanNode;
  /** The link that opens the decide-in-words form. */
  yourself: ReactNode;
}

const kindOf = (node: PlanNode) => (node.type === "spike" ? "spike" : "research");

function Blocked({ plan, node }: StepProps) {
  return (
    <p className={css.why}>
      This question depends on{" "}
      {openBlockers(plan, node).map((id) => (
        <button key={id} type="button" className={css.ref} onClick={() => openNode(id)}>
          {id}
        </button>
      ))}
      . Decide those first; this one opens up when they are settled.
    </p>
  );
}

function Busy({ node }: StepProps) {
  const running = node.run?.status === "running";
  return (
    <Working>
      {running
        ? `Running${node.run?.note ? `: ${node.run.note}` : ""}. You can decide other questions meanwhile; this page updates when it is done.`
        : `${node.thread.at(-1)?.text ?? "Waiting for the agent."} The answer shows up here.`}
    </Working>
  );
}

function Start({ node, yourself }: StepProps) {
  const spike = kindOf(node) === "spike";
  return (
    <>
      <p className={css.why}>
        {spike
          ? "This question is settled by building each approach a little and measuring the difference. Agents do that on their own (AFK), each in its own worktree, while you decide other questions. When they finish, the agent compares them and proposes a decision."
          : "This question needs facts from outside the code. An agent researches it on its own (AFK) while you decide other questions. When it finishes, it proposes a decision from what it found."}
      </p>
      <Ask
        node={node}
        kind={kindOf(node)}
        label={spike ? "Start the spike" : "Start the research"}
        placeholder={spike ? "Optional: the approaches to compare, what to measure, what to leave out" : "Optional: what to look into, sources to trust, what would change the answer"}
      />
      {yourself}
    </>
  );
}

function Findings({ node, yourself }: StepProps) {
  const what = kindOf(node);
  return (
    <>
      <p className={css.why}>The {what} is done; read the findings below. The agent can propose a decision from them, as options with the one the findings support recommended.</p>
      <Ask node={node} kind="propose" label="Have the agent propose a decision" placeholder="Optional: what matters most when choosing" />
      <details className={css.more}>
        <summary>Not enough to decide? Dig further</summary>
        <Ask node={node} kind={what} primary={false} label={what === "spike" ? "Spike again" : "Research deeper"} placeholder="What the findings missed, or what to check next" />
      </details>
      {yourself}
    </>
  );
}

function Choose({ node }: StepProps) {
  return (
    <>
      <p className={css.why}>Compare the options below and decide. Not convinced? Ask a question under Discuss, or have the agent go deeper.</p>
      <Ask node={node} kind="deeper" primary={false} label="Go deeper" placeholder="Optional: what the options miss" />
    </>
  );
}

function Options({ node, yourself }: StepProps) {
  return (
    <>
      <p className={css.why}>This question is yours to settle. Have the agent lay out the options with their trade-offs, or research it first if a fact would settle it.</p>
      <Ask node={node} kind="options" label="Ask for options" placeholder="Optional: options to include, or what matters most" />
      <div className={css.alt}>
        <Ask node={node} kind="research" primary={false} label="Research it first" placeholder="What to find out" />
      </div>
      {yourself}
    </>
  );
}

const BODIES = { blocked: Blocked, working: Busy, start: Start, findings: Findings, choose: Choose, ask: Options, task: () => null } satisfies Record<Step, (props: StepProps) => ReactNode>;

export function NextStep({ plan, node }: { plan: Plan; node: PlanNode }) {
  const step = nextStep(plan, node);
  const [deciding, setDeciding] = useState(false);
  const Body = BODIES[step];
  const yourself = (
    <button type="button" className={css.link} onClick={() => setDeciding(!deciding)}>
      {deciding ? "Hide" : "Or decide it yourself"}
    </button>
  );
  return (
    <>
      <Panel className={cx(css.panel, css[step])}>
        <h3>{STEP_TITLE[step]}</h3>
        <Body plan={plan} node={node} yourself={yourself} />
      </Panel>
      {deciding || step === "task" ? <DecideInWords node={node} /> : null}
    </>
  );
}
