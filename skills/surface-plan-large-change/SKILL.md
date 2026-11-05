---
name: surface-plan-large-change
description: Plan a change too large for one agent session on the pi-surface browser page, across many sessions. Explores the problem space, settles the high-leverage architecture decisions first (as a map of questions with research and spikes run by subagents), breaks the route into slices small enough to build and review one at a time, writes the RFC, architecture doc and decision log for team buy-in, and tracks slices as other sessions report back. Supports second opinions from another model on anything it writes. Needs the pi-surface extension.
disable-model-invocation: true
---

# Plan a large change

The big brother of `surface-forge-solution`. Forge designs one change that fits a session. This skill decides the route for an effort that spans many: what to build, how the architecture changes, and how to cut the work into slices. Then it hands slices to forge or to implementation sessions and tracks what comes back. The engineer chose this skill over forge; take that as given.

A plan lives on disk outside the checkout, under the `surface.plans.root` setting (default `~/Work`), then the repository's name, then the plan's slug. It outlasts Pi sessions: any session reopens it with `surface_plan_open`. `state.json` is the source of truth; the markdown beside it is regenerated on every change for people and other agents to read.

If `surface_plan_open` is not available, say the pi-surface extension is not loaded and stop.

## The rules of the map

- **Destination first.** Name what done looks like for the whole effort before the first node. It fixes the scope every node is measured against.
- **Every node is a question.** A node asks something the plan must settle before anyone builds: "Where does metering run?", never "Build the meter". Delivery belongs in slices, which come after the map clears.
- **Fog is honest.** A decision you can see coming but cannot phrase sharply yet is fog, not a vague node. Fog graduates into a node (`fromFog`) once a decision clears it.
- **The user decides HIL nodes.** You recommend; the decision arrives as a message after the user clicks. Answering your own question breaks the plan.
- **Reality before decisions.** Prefer a research run or a spike over a confident guess when a fact or a measurement would settle the question.
- **The plan decides; it does not build.** Write no product code. Spikes run in their own worktrees and exist to measure.

## 1. Open or start the plan

Call `surface_plan_open` with the checkout's `worktree` and either the plan's `slug` or, for a new plan, a `title` (and the `destination` if the user gave one). Without either, its error lists the repo's plans; ask which one. If the result says read-only, another live session holds the plan: tell the user they can take it over on the page.

On an existing plan, read the result's frontier and new slice reports, then go to step 3. A slice report with deviations comes first: say which nodes and slices it touches.

## 2. Frame a new plan

1. Settle the destination and out of scope with the user in one short exchange, and record them with `surface_plan_map`.
2. Run a breadth-first pass for the **highest-leverage** questions: the ones whose answers change the most downstream, or that are most expensive to get wrong. Read the code first so questions are grounded in what exists.
3. Chart the map with one `surface_plan_map` call: the nodes with types, modes and `blockedBy` edges, and the fog. Read [references/nodes.md](references/nodes.md) to pick each node's type.
4. Start the AFK nodes on the frontier (research and spikes run as async subagents), then put options on the most leveraged HIL node with `surface_plan_ask`, which ends your turn.

Framing is done when the map has a destination, at least the first ring of questions with their blocking edges, and the fog you can see.

## 3. Work the frontier

Each user action on the page arrives as a message starting `Surface · plan ·`, followed by the plan line (title, slug, files, worktree). Handle it, call the tool it names, and end your turn.

| Message | Do | With |
|---|---|---|
| decided Nn | Update the map: graduate fog the decision clears, add questions it makes askable, revise nodes it changes. Then move the frontier as in step 2.4. | `surface_plan_map`, then `surface_plan_ask` |
| reopened Nn | The old answer is gone; do not design around it. Ask what changed, re-pose the options, and name the downstream nodes and slices it may invalidate. | `surface_plan_ask`, `surface_plan_node` |
| question about Nn | Answer from the code and findings in two to five sentences; add a visual when structure explains it better. | `surface_plan_node` text |
| options / deeper / research / spike Nn | Per [references/nodes.md](references/nodes.md). | `surface_plan_ask`, `surface_plan_node` |
| clarify fog Fn | Phrase it as a node if it can be asked precisely now; otherwise leave it and say what it waits on. | `surface_plan_map` |
| work the frontier | Start AFK runs, then post the most leveraged HIL node's options. | `surface_plan_node`, `surface_plan_ask` |
| update the architecture | Step 4. | `surface_plan_architecture` |
| break the plan into slices | Step 5. | `surface_plan_slices` |
| design Sn in forge | Start a forge session for the slice with its relied-on decisions locked; record the approved spec's path on the slice. | `surface_forge_ask`, then `surface_plan_slices` |
| write the RFC / architecture doc / decision log | Step 6. | `surface_plan_artifact` |
| second opinion On · corrections · question about On.k | Per [Second opinions](#second-opinions). | `surface_plan_opinion`, `surface_plan_opinion_update` |

Every option and finding you post carries visuals chosen per [references/visuals.md](references/visuals.md).

## 4. Architecture

Read the code and the decided nodes, then publish the current and target architecture as component graphs with `surface_plan_architecture`. Name the decisions behind every change in `changes`, and list components whose contract changes in `changed`. Redraw it when decisions move it; the page flags decisions made since it was drawn.

## 5. Slices

When the frontier is empty and the fog left is out of the way of the destination, propose the slice graph with `surface_plan_slices`, per [references/slices.md](references/slices.md). The user revises and approves it on the page. Once approved, slices are ready for forge or implementation; this skill tracks them and does not start them.

## 6. Artifacts

Write each artifact the user asks for from the decided nodes, the architecture and the slices, per [references/artifacts.md](references/artifacts.md), and publish it with `surface_plan_artifact` (`final: true` when complete; the user approves it on the page). The session saves it under the plan's `artifacts/`.

## Second opinions

The user asks another model to review a node, the map, the architecture, the slices or an artifact. The messages say exactly what to run:

- **Review pass**: run the review as a read-only subagent on the named model with the given prompt, then publish its findings unchanged with `surface_plan_opinion`, with its run id. Do not act on them; the user triages first.
- **Corrections**: you are the author. Apply each accepted finding to the target, resuming the subagent run that wrote it when the target came from research or a spike, then report done or declined per finding, with the text before and after, in one `surface_plan_opinion_update`.
- **Question about a finding**: answer in its thread with `surface_plan_opinion_update` `replies`.

A second opinion never changes a decision the user made.

## Slice reports from other sessions

`surface_plan_slice_report` is declared in every session. A session building from a slice brief (`slices/S<n>.md` under the plan) calls it to mark the slice in progress, done or blocked, and to report an assumption that turned out wrong with the nodes it touches. When that happens in your session, call it yourself.
