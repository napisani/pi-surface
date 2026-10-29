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
| Triage verdict | `triage`, per [Triage](#triage) |
| Finding and fix profile | `scores`, per [Scores](#scores) |

A clean review still publishes: an empty `findings` array, the summary, and whatever was dropped.

## Triage

Every finding gets a verdict on whether to act on it in this diff. The verdict
weighs severity against how big the fix really is and whether the fix stays in
the diff's own files. Triage the numbered findings only; disagreements and
dropped candidates get no verdict.

First get the diff's file set from `git diff --stat` against the merge base,
plus untracked files in a live review. Read its intent from the branch name and
commit messages.

Then read the cited code yourself and size the fix. The finding's `fix` line
can understate or overstate the change.

| `fixSize` | The fix is |
|---|---|
| `Trivial` | one line or expression, in the function already cited, no new files |
| `Small` | a handful of lines, same file, no new files |
| `Moderate` | new logic or a helper, still inside files the diff touches |
| `Large` | touches a file outside the diff, or needs a refactor or new abstraction |

`touches` lists every file the fix edits. The page flags the ones outside the
diff. A fix is in scope and cheap when it is `Trivial` or `Small` and every
file it touches is already in the diff. Anything else expands scope.

| `bucket` | When |
|---|---|
| `fix-now` | Worth doing, in scope and cheap. |
| `fix-now-expands` | Worth doing, but it expands scope. Critical and High always qualify. For Medium and Low, the value has to earn the extra scope, e.g. the same defect already happened elsewhere in this diff. |
| `defer` | Real, but not urgent enough to grow this diff; file a follow-up. |
| `skip` | Cosmetic, speculative, or the fix costs more attention than the problem is worth. |

Severity is the consequence signal; do not score urgency a second time.
Critical and High are always `fix-now` or `fix-now-expands`, whatever the fix
costs. Medium and Low take judgment. `reason` is one sentence: severity, fix
size, and why it landed here. When the call is close, say which way it leans
and why. `surface_review_findings` rejects a verdict that breaks these rules.

## Scores

Score every finding from 1 to 5 on each axis, with a one-line `why` naming the
concrete input, file or test behind the score. The page draws all findings on
one radar, so keep the anchors the same across findings. On every axis, 5 is
the stronger case for fixing it in this diff.

| Axis | 5 | 1 |
|---|---|---|
| `impact` | security hole, data loss, wrong results (Critical) | cosmetic (Low) |
| `likelihood` | ordinary input on a hot path hits it | needs a contrived state |
| `confidence` | a test or trace showed it (High) | inferred from reading (Low) |
| `ease` | `Trivial` fix | `Large` fix |
| `containment` | every touched file is in the diff | reaches well outside it |
| `safety` | the fix cannot change other behavior | the fix risks regressions elsewhere |
| `verifiable` | a focused test proves the fix | no practical way to test it |

Keep the scores consistent with the other fields: `impact` follows severity,
`confidence` follows the confidence level, and `ease` and `containment` follow
the triage's fix size and files.

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
