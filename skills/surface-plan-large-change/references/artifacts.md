# Artifacts

Write each artifact from the plan's settled state: the decided nodes (`decisions/` and `map.md` in the plan directory), the architecture, and the slices. Mark anything still open as `TBD(Nn)`, naming the node, so a reader sees what is undecided rather than a guess. Publish with `surface_plan_artifact`; `final: true` asks the user to approve it.

## RFC

For reviewers judging the approach in one sitting. Follow [the forge RFC format](../../surface-forge-solution/references/rfc-format.md), with these changes for a multi-slice effort:

- The proposal section walks the target architecture and the decided nodes that shape it, each with the alternatives considered and why they lost.
- Add a **Delivery** section: the slices in order, with their dependencies and sizes, and what is safe to ship after each.
- Risks name the nodes still open and the assumptions slice reports may yet overturn.

## Architecture doc

For engineers who will work in the system:

1. **Current**: how it works now, with the current graph and the code paths that matter.
2. **Target**: how it will work, with the target graph.
3. **Changes**: each added, removed or changed component, the decisions that drive it, and its new contract.
4. **Data and state**: stores, schemas and migrations, with an ER diagram where data changes.
5. **Failure and operations**: what fails how, what is observed, how it rolls out and back.

## Decision log

One ADR-style entry per decided node, in the order they were decided:

```
## N3: How is usage stored for the backfill?
Status: decided 2026-11-05 · relies on N1
Decision: Postgres, partitioned by day.
Options considered: Postgres partitioned by day (chosen); a columnar store; reuse the logs bucket.
Why: <the user's note, and the trade-offs that decided it>
Second opinions: O2 (openai-codex/gpt-6-luna) raised 3 findings; 2 accepted and corrected, 1 declined because <reason>.
Consequences: <what it commits the plan to; slices that rely on it>
```

Reopened decisions keep their old entry, marked superseded, followed by the new one.
