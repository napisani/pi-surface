# Nodes

Every node asks one question. Its type says how it gets settled.

| Type | Mode | Use when | Settled by |
|---|---|---|---|
| `discuss` | HIL | Talking it through and comparing options can settle it. The default. | The user picks an option you posted with `surface_plan_ask`, or decides in words. |
| `research` | AFK | A fact outside the checkout blocks a decision: an API's limits, a library's behavior, prior art. | A research subagent's cited findings, then options you propose from them; the user picks. |
| `spike` | AFK | Reading cannot settle it; building each approach a little and measuring can. | Worker subagents build each approach in its own worktree; the user picks from the comparison. |
| `task` | HIL by default | Manual work blocks a decision: access, an account, sample data. Never a slice of the build. | Its checklist is done and the user marks it done. |

A node's `blockedBy` lists the nodes that must be decided first. A node with all its blockers decided sits on the frontier.

## Posting options

`surface_plan_ask` puts 2-4 options on a discuss or spike node, the same shape forge uses:

- Phrase the node's title so each option is a direct answer. Lead with the recommended option and make its trade-offs say why it wins here.
- Each option: a description of one or two plain sentences (at most 280 characters), short pros and cons judged against the other options, a visual for every lens, and a 1-5 score on every trade-off dimension with a one-line reason.
- Dimensions are what this decision trades between (scope, risk, reversibility, operability, latency): only those where the options differ.
- Read the code first. A diff names files that exist; a call tree uses the real call path.

## Go deeper

Find what the current options or findings miss: an unconsidered option, an assumption no one checked, a failure mode. Add visuals with `surface_plan_node`, and re-post the options with `surface_plan_ask` when they change.

## Research runs

1. Launch one async research subagent with a sharp brief: the question, what is already decided, what answer would change the plan, and where to look.
2. Report it with `surface_plan_node` `run` `running` and its `runIds`, then keep working other nodes; the run wakes you when it finishes.
3. Publish the cited findings with `surface_plan_node` `result` (markdown plus a `matrix` or `data` visual when they compare).
4. Propose the decision in the same turn: post options with `surface_plan_ask`, the one the findings support recommended, each pro and con citing the finding behind it. The user should never be left to turn raw findings into a decision alone. When the findings leave a gap that matters, say so in the node's thread and suggest the follow-up research or spike instead.

## Spikes

1. Name the approaches (two or three). Launch one async worker subagent per approach, each in its own git worktree named `<repo>__worktrees/plan-<slug>-<node>-<approach>`, building just enough to measure the difference: call sites covered, blast radius, tests passing, timings.
2. Report the run with `surface_plan_node` `run` `running`, its `runIds` and `worktrees`. Never edit the user's checkout.
3. When they return, publish a comparison with `surface_plan_node` `result`: a `matrix` of approaches by measured criteria, with the cells that decide it toned good or bad. Then post the approaches as options with `surface_plan_ask`; the user picks.
4. The user removes spike worktrees when done with them.

## Reopened nodes

A reopened node's old answer no longer holds. Ask what changed, re-post options that reflect it, and say in the node's thread which downstream nodes and slices the change may invalidate (the reopen message lists them). Revise those nodes with `surface_plan_map` rather than working around the new answer.
