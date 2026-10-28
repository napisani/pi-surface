# Publishing findings

`surface_review_findings` takes the consolidated, verified review report. The page shows every finding with its code and visuals, so each one has to stand on its own when the user opens it cold.

## Review and verify

Read the diff and surrounding code in the named worktree. Check correctness,
security and trust boundaries, error handling, tests, performance, and simplicity.
Use the user's focus to prioritize the review. Keep findings tied to this change;
leave unrelated cleanup out.

For each candidate, trace the caller and relevant guards, then verify the failure
with a focused test or concrete code evidence. Record checks you actually ran and
say when you could not run one. Merge duplicates, drop disproved candidates with
a reason, and preserve unresolved disagreements. Do not edit files during review.

Summarize the scope, the change's intent, and its risk. Rank findings Critical,
High, Medium, then Low. Each needs a confidence level with its reason, a category,
the failing behavior, evidence, and a concrete fix. Publish an empty findings list
when no issue survives verification.

## Mapping the report

| Report | Tool field |
|---|---|
| Scope and Base lines | `summary.scope`, one line |
| Intent paragraph | `summary.intent` (`not determined` stays as is) |
| Risk | `summary.risk` |
| Findings, in report order (Critical → Low) | `findings[]`; the page numbers them F1.. in this order |
| Title, severity, confidence and its reason, category | same-named fields |
| The prose paragraph | `summary` (markdown) |
| Fix, Evidence, Verified | `fix`, `evidence`, `verified` |
| Disagreements | `disagreements[]`, one line each |
| Dropped in verification | `dropped[]` with severity, title, lens, reason |

A clean review still publishes: an empty `findings` array, the summary, and whatever was dropped.

## Code refs

- `primary` is the triggering code: the line range the evidence quotes, at the revision it lives in. `rev` is `work` for the working tree in a live review, `head` for the commit under review in a pinned one, and `base` for removed code. Keep it tight, usually 1–10 lines.
- `related` holds the other code a reader needs to believe the finding: the caller that passes the bad value, the guard that is missing or present elsewhere, the schema, the test that should catch it. Files outside the diff are fine. Give each a `note` saying why it is there.
- Read every range from the worktree (`sed -n 'A,Bp' file`, or `git show <mergeBase>:path` for `base`) before publishing it.

## Visuals

Give each finding the 1–3 views that make the issue obvious to someone who has not read the code. Pick per finding; the views below are a menu, not a checklist.

| The finding is about | Show |
|---|---|
| A request, message or data path; a trust boundary crossed | `mermaid` sequenceDiagram or flowchart, with the failing step marked |
| A schema, migration, cache or stored data | `mermaid` erDiagram, plus `data` with example rows, plus `query` with the query that goes wrong and its result |
| Inputs or edge cases that break it | `data` table of cases, the failing rows highlighted `bad` |
| Who calls what; where ownership or a seam sits | `callTree` |
| State that can go invalid | `mermaid` stateDiagram with the bad transition |
| A simpler or safer shape | `code` with `+`/`-` lines, or `diff` |

Rules every visual follows:

- A short `label` (the tab name) and a `look` line naming the one thing to notice.
- Real identifiers, values and paths from this change.
- Each visual adds something the code refs do not; a visual that restates the primary code earns no tab.
- Mermaid must parse: quote labels with punctuation, keep node ids alphanumeric.
