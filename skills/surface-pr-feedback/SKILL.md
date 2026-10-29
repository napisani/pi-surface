---
name: surface-pr-feedback
description: Work through pull request feedback with the user on a live browser page. Understand each review comment and the code it points at, decide fix / respond / skip, apply fixes in batches, commit and push from the page, and draft or revise replies the user posts. Also takes feedback pasted in chat. Needs the pi-surface extension's surface_feedback_open tool.
disable-model-invocation: true
---

# Web address PR feedback

Write page text with short sentences and concrete words. Name the reviewer's concern, the code that supports it, and the consequence. Cut filler, inflated claims, and commentary that tells the reader what to think.

You put the PR's feedback on the page with `surface_feedback_open`, triage it, then serve the user's requests from the page. The page belongs to the user. They read, decide, commit, push and post. You do the work behind its buttons.

Three boundaries hold for the whole session:

- **The user posts to GitHub.** Your tools write reply drafts. A reply reaches GitHub when the user clicks Post, and only then.
- **The user commits and pushes.** You propose commits with `surface_feedback_commits`; the page runs git when the user clicks Commit or Push. Leave history-writing git commands (`commit`, `push`, `reset`, `rebase`, `stash`) to the page.
- **You edit files only for fix rounds.** Triage, answers and replies read the code and leave it as it is.

If `surface_feedback_open` is not available, say the pi-surface extension is not loaded and stop.

## 1. Find the PR and the checkout

The page works in the user's own checkout of the PR branch, since that is where fixes, commits and pushes happen.

- A URL or `owner/repo#N` works as is; a bare number belongs to the current repository; "my PR" or a branch name needs `gh pr view --json url,headRefName` or `gh pr list --search …`. Stop and ask when more than one PR fits.
- `worktree` is the checkout whose branch is the PR's head branch: the current directory when `git branch --show-current` matches, otherwise a worktree from `git worktree list` on that branch. When none is on it, ask the user before switching branches or creating a worktree, and say what is uncommitted.
- Feedback only in chat, with no PR: open with `worktree` and no `pr`, then add the items with `surface_feedback_add`.

## 2. Open and triage

Call `surface_feedback_open`. If it fails on missing commits, run the fetch it names and call it again. If it returns a warning, tell the user in one line.

When the result carries a triage request, triage every listed item per [references/triage.md](references/triage.md) and publish with `surface_feedback_triage`. With many items, publish in batches (`final: false`) so the page fills as you go, and finish with `final: true`. Then end your turn; tell the user only that the page is up. When nothing needs triage, the tool ends your turn for you.

Feedback the user pastes in chat later goes through `surface_feedback_add`, verbatim, one item per distinct point, with a `ref` when the point is about specific lines. Triage the new items the same way.

## 3. Serve page requests

Each request arrives as a message starting `Surface · feedback ·` with a `Feedback:` line naming the PR and worktree, and the items it concerns: the reviewer's words, your earlier triage, the user's decision, the fix thread and any commit. Handle it, call the tool it names, and end your turn.

| Request | What to do | Publish with |
|---|---|---|
| triage N items | Triage per [references/triage.md](references/triage.md). | `surface_feedback_triage` |
| question about PF-n | Read the code the item points at and what it touches, then answer the latest question in two to five sentences: what the reviewer means, whether they are right, what breaks either way. Earlier messages are context. Add a visual when structure explains it better than prose. | `surface_feedback_answer` |
| question about PF-n's reply | Answer the latest question about the quoted reply in one to three sentences: why it says what it says, or whether it holds up. Do not rewrite it; revisions arrive as reply assist requests. | `surface_feedback_answer` with `about: "reply"` |
| fixes, round N | Apply each fix per [Fix rounds](#fix-rounds). | `surface_feedback_fix_update`, once, covering every item |
| propose commits | Group the fixes per [Commit proposals](#commit-proposals). | `surface_feedback_commits` |
| reply assist · PF-n | Rewrite the reply as asked, per [references/replies.md](references/replies.md). An empty draft means write it from scratch. | `surface_feedback_reply_draft` |
| draft replies for N items | One reply per item, per [references/replies.md](references/replies.md). | `surface_feedback_reply_draft`, once per item |

If triage or a commit proposal cannot finish, report it with `surface_feedback_status` (`failed`, with the reason) so the page stops waiting. When the user says in chat that reviewers left new comments, tell them to click Refresh, or call `surface_feedback_open` again: reopening keeps every decision, fix and reply and adds the new items.

## Fix rounds

Each item in a round carries the reviewer's words and its fix thread. Earlier rounds' outcomes are in the thread; the last user line is what to do now.

- Make each fix in the worktree, scoped to what the reviewer and the user asked. Thread line numbers are on the PR head; find the code there if earlier edits moved it.
- Two items asking for the same change get one edit; report it on both.
- Run the smallest check that covers your edits (a typecheck, the nearest test) when one exists.
- Then call `surface_feedback_fix_update` once with every item in the round:
  - `done`, with a one-line reply saying what changed, and `files` listing every path you edited for it. Commit proposals are built from these paths.
  - `declined`, with the reason, when the fix would break something or the promised fix turns out to be wrong. Say what you would do instead.
  - `needs-input`, with your question, when the instruction is ambiguous. Ask instead of guessing.

## Commit proposals

- Read `git status --porcelain` and `git diff` in the worktree. The message lists the fixed items and their files.
- Group by reviewer intent: one commit per distinct change, items that share an edit in the same commit. One commit for everything is right when the fixes are small and related.
- Each proposal names the items it settles and the exact paths. Leave out changes no fixed item explains, and mention them in your end-of-turn message.
- Write messages in the repository's style (`git log --oneline -15`): imperative subject under 72 characters, a body only when the why is not obvious.

Replies name the commit once the user commits, so commits come before replies in the usual flow.
