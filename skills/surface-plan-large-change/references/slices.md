# Slices

A slice is one unit of delivery: a person or an agent builds it, and a team reviews it, on its own. Slice the route as **tracer bullets**: each slice cuts end to end through the layers it needs and leaves the system working, rather than one slice per layer.

Each slice in `surface_plan_slices` carries:

- **title** and **deliverable**: what exists when it is done, in one or two sentences.
- **acceptance**: checks a reviewer can verify without asking the author.
- **touches**: the modules or paths it changes. Two slices that touch the same files in parallel will conflict; order them with `dependsOn` or merge them.
- **dependsOn**: slices that must land first. Keep the graph shallow; a long chain serializes the work.
- **size**: S (an afternoon), M (a day or two), L (most of a week), XL (split it). A slice a reviewer cannot read in one sitting is too big.
- **mode**: AFK when an agent can build it from the brief alone; HIL when it needs judgment calls the plan did not settle.
- **decisions**: the decided nodes it relies on. A reopened node flags these slices.
- **brief**: the markdown someone builds from: the context, the approach the decisions chose, the risks, and what is deliberately left out. It must stand alone; the reader may never see the plan page.

Before proposing, check: every part of the destination is covered by some slice; out-of-scope work is in none; the first slice is small and proves the riskiest assumption; a feature flag or dark launch keeps unfinished work safe to merge.

When revising, keep a slice's id so its reports and links survive. A slice that needs its own design pass goes to forge from the page; record the approved spec's path in `forgeSpec`.
