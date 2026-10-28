# Writing the walkthrough

A walkthrough is the path a reviewer should take through the change: where to start, what each stop does, and why it matters. The page shows the steps in order, each beside its code.

## Explore

Read the PR description when there is one, `git diff --stat` for the diff the request names, and the commit messages in the worktree. Then read the files that carry the change. Generated files, lockfiles and mechanical renames rarely earn a stop. When the change mixes unrelated themes and the request names no focus, tour the main theme and say in the summary what was left out.

## Shape

- 4–8 steps by default; up to 12 for a large change. One step per seam the change crosses, not one per file.
- Order them the way a reader should walk: entry point or API first, then the core change, then what it affects, then the tests that pin it down.
- Each `ref` is a small range (usually under 30 lines) that shows the point of the step. Use `rev: "base"` for removed behavior the reader needs to see; otherwise `work` in a live review and `head` in a pinned one.
- `body` is a short paragraph: what to notice and why it matters. It explains; it does not restate the code.
- Add a `visual` where structure beats prose: an overview flowchart on the first step is often worth it; a sequence diagram where calls cross modules; a data table where shapes change.
- `title` names the change; `summary` says in 2–4 sentences what the change does and the route the tour takes.

Read every ref's lines from the worktree before publishing.
