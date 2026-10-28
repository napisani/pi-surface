# Triage

Triage turns each feedback item into something the user can decide on cold: what the reviewer means, whether you agree, what the change would cost, and the code that shows it. The page shows your analysis beside the reviewer's words and the code, so each one has to stand on its own.

## Read first

For every item, read the code it points at before writing anything:

- A review thread's lines are on the PR head (`git show <headSha>:<path>`; the `Feedback:` line names the worktree). Outdated threads have only the original line and GitHub's hunk; find where that code lives now.
- A review summary or PR comment has no lines; find the code it is about.
- Read past the anchored lines to the callers, the tests and the code the change would touch, enough to judge the risk and rework.

## Fields

| Field | What to write |
|---|---|
| `meaning` | What the reviewer is asking for, in plain words, one or two sentences. Name the concrete thing ("`check` throws when `log` is undefined"), not the category ("a correctness concern"). |
| `recommendation` | `fix`, `respond` (answer without changing code), or `skip` (no reply needed, e.g. an approval note or a bot report). |
| `rationale` | One or two sentences: whether you agree and why. Disagree plainly when you do. |
| `risk` | The risk the change introduces, not the risk of ignoring it. |
| `importance` | How much the change matters to what the PR is for. |
| `rework` | How much code has to change. |
| `promised` | `true` only when one of the user's own replies (marked "(you)") clearly commits to a specific change: "I'll rename this", "will switch to X", "fixing in the next push". Ambiguous replies are `false`. |
| `promisedFix` | When promised: the fix the user committed to, written as an instruction. The page queues it as a pending fix. |
| `nextStep` | The concrete change to make ("Import `log` from `./logger` in src/auth.ts"), or what the reply should say when nothing changes. The page offers it as the default fix instruction. |
| `refs` | The code a reader needs: the anchored lines first, then the caller, the test, the other place the same pattern lives. Keep each range tight (usually under 15 lines) and give each a `note`. `rev` is `work` for the working tree, `head` for the PR head as reviewers saw it, `base` for the merge base. |
| `visuals` | Zero to two, only when structure beats prose: a call tree when the issue is where something gets called, a data table of inputs and results when it is about behavior, a sequence diagram when it crosses modules. Most items need none. |

## Calibration

- An item the user already promised to fix is `fix`, with `promised: true`. Do not argue it again unless the fix is unsafe; then say so in `rationale`.
- Questions from a reviewer ("why is this here?") are usually `respond`, unless the honest answer is "it shouldn't be".
- Style nits the repository has no rule for: `respond` or `fix` by rework; never inflate their importance.
- Bot comments and approvals with no ask: `skip`.
