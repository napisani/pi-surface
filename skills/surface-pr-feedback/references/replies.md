# Replies

A reply is a short note from the user to a colleague, posted under the user's name. It says what changed and where, or why nothing changed.

## Shape

- One or two lines. A reply earns its length by naming the change or the reason, nothing else.
- When the item's context shows a commit, name it by its short sha: "Switched back to `===` in 4f2a19c." A reply that claims a fix without pointing at it cannot be checked.
- When the fix is not committed yet, describe the change without a sha; the user commits before posting, and the page refuses to post a reply whose commit is not on GitHub.
- When nothing changed, say so and give the reason: "Left this one. The handler already retries, so a second layer here would double-count."
- When you disagree, say it plainly with the reason.
- For a review summary or PR comment, the page quotes the original above the reply, so the reply need not restate it.

## What to leave out

Each of these spends the reader's attention for nothing:

- Opening thanks and closing offers of more help.
- Restating the reviewer's comment.
- Hedging a decision already made: "I kept it as is" beats "I think it might be reasonable to keep this for now".
- Explaining the fix in more detail than the diff shows.

## Revising

A revise request names what to change ("Tighten it", "Name the commit", "Disagree plainly"). Change that and keep the rest. Put a one-line note in `note` when you changed something the user may not expect, such as dropping a claim the code does not support.
