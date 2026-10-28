---
name: surface-code-review
description: Review code with the user on a live browser page with GitHub-style diffs, a file tree with docs/tests/implementation filters, change requests the user sends in batches for you to apply, a multi-valued review with visual findings, questions, and a walkthrough. Works on local changes with no PR, and on a GitHub pull request (adding GitHub comments posted per click). Use when the user wants to review, annotate or iterate on their changes, a branch, or a PR in the browser or on the web page. Needs the pi-surface extension's surface_review_open tool.
disable-model-invocation: true
---

# Web code review

Write page text with short sentences and concrete words. Name the failing input, code path, and consequence. Cut filler, inflated claims, and commentary that tells the reader what to think.

You put code on the page with `surface_review_open`, then serve the user's requests from it. The page belongs to the user. They browse diffs, annotate lines, ask questions, and post comments. You do the work behind its buttons.

Two boundaries hold for the whole session:

- **The user posts to GitHub.** Your tools only write comment drafts. A comment reaches GitHub when the user clicks Post, and only then.
- **You edit files only for change requests.** Everything else (reviews, answers, walkthroughs) reads the code and leaves it as it is.

If `surface_review_open` is not available, say the pi-surface extension is not loaded and stop.

## 1. Decide what to review

| The user wants | Open with |
|---|---|
| Their local work: a branch, uncommitted changes | `worktree` = their checkout. Add `base` only if they name one (`HEAD` for uncommitted only, another branch to compare against). Live by default. |
| Their own PR, to iterate on it | `worktree` = their checkout on the PR branch, `pr`, `live: true`. They get change requests and GitHub comments. |
| Someone else's PR | `worktree` = a dedicated worktree at the PR head (step 2), `pr`, `live` omitted. Comments only. |

To resolve a PR from what the user gave you: a URL or `owner/repo#N` works as is; a bare number belongs to the current repository (`gh pr view N --json url`); "my branch's PR", a ticket or a branch name needs a lookup (`gh pr view --json url`, `gh pr list --search …`). Stop and ask when more than one PR fits, or when it is unclear whether the user wants their working tree or a fresh worktree.

## 2. Pinned PR reviews: get a worktree at the PR head

Only for someone else's PR. Review from a dedicated worktree so the user's checkout stays untouched:

```sh
gh pr view <pr> --json number,headRefOid,baseRefName
git -C <clone> worktree list --porcelain       # reuse one already at headRefOid, e.g. workmux's review/<N>
git -C <clone> fetch origin "pull/<N>/head" "<baseRefName>"
git -C <clone> worktree add --detach "<clone>__worktrees/pr-review-<N>" <headRefOid>
```

A `pr-review-<N>` worktree you created earlier can move to a new head with `git -C <wt> checkout --detach <headRefOid>` when `git -C <wt> status --porcelain` is empty. Any other worktree is the user's; when one of those is behind, create a fresh `pr-review-<N>` worktree instead. `surface_review_open` refuses a pinned worktree that is not at the PR head.

## 3. Open the page

Call `surface_review_open`. It opens the browser and ends your turn. Tell the user only that the page is up. If it fails on missing commits or a missing base, run the fetch it names and call it again.

## 4. Serve page requests

Each request arrives as a message starting `Surface · review ·` with the review line (what, worktree, live or pinned, base). Handle it, call the tool it names, and end your turn.

| Request | What to do | Publish with |
|---|---|---|
| change requests, round N | Apply each request in the worktree, per [Change requests](#change-requests). | `surface_review_request_update`, once, covering every request |
| run the multi-valued review | Review the named diff per [references/findings.md](references/findings.md), including any focus the user gave. Report progress with `surface_review_status` when review starts and when verification starts; on failure, report `failed` with the reason. | `surface_review_findings` |
| draft comments for N findings | One GitHub comment draft per finding, per [Comment drafts](#comment-drafts). | `surface_review_comment_draft` with `findingId` |
| comment assist · Cn | Rewrite draft Cn as asked, keeping its anchor unless the request moves it. An empty draft means write it from scratch. | `surface_review_comment_draft` with `commentId` |
| question about Fn | Answer from the code, not from memory of the review. Add a visual (same vocabulary as findings) when structure explains it better than prose. | `surface_review_finding_reply` |
| question Qn about some lines, a step, or the change | Read the referenced lines and what they touch, then answer the latest question in two to five sentences. Earlier messages are context. Add a visual when it helps. | `surface_review_question_reply` |
| generate a walkthrough | Write the tour per [references/walkthrough.md](references/walkthrough.md). | `surface_review_walkthrough` |

When the user says in chat that a PR has new commits, update a pinned worktree (step 2) and call `surface_review_open` again. Live reviews pick up edits when the user clicks Refresh or when you report a request round. Reopening the same review keeps everything on the page.

## Change requests

Each request in a round has an id, a location, the text of the anchored line when it was written, and its thread. Earlier rounds' replies are in the thread; the last user message is what to do now.

- Make each change in the worktree, scoped to what its request asks. Line numbers are from before your edits; the quoted line finds the spot when they moved. A request about the whole change can touch any file.
- Run the smallest check that covers your edits (a typecheck, the nearest test) when one exists.
- Then call `surface_review_request_update` once with every request in the round:
  - `done`, with a one-line reply saying what changed. Pass `anchor` when the change now lives at different lines, so the page shows the request there.
  - `declined`, with the reason, when the change would break something or contradicts another request.
  - `needs-input`, with your question, when the request is ambiguous. Ask instead of guessing.
- Leave commits to the user. Edit files only.

## Comment drafts

GitHub comments exist only on PR reviews. A draft is a note from the user to the PR author, so write it in the user's voice: short, plain, specific to the line.

- One to three sentences: what is wrong, why it matters here, what to do. Name the concrete input or path that breaks.
- When the fix lives inside the anchored lines, add a `suggestion` block holding the replacement for exactly those lines (from `startLine` to `line`).
- Ask a question instead of asserting when the finding's confidence is Low.
- Skip greetings, praise, thanks, and restating the code.

Anchors must sit on a line inside one of the diff's hunks, on the side that line belongs to: RIGHT for added or unchanged lines at the head, LEFT for removed lines. A finding's primary location is the default anchor. When it falls outside the hunks, anchor to the nearest changed line that shows the problem and say so in `note`.
