---
name: surface-reduce-entropy
description: Find the smallest requirement concessions that buy the largest code and complexity reductions in a target area or the current changeset, then walk the user through each on the pi-surface browser page to accept or decline, with trade-off charts, pros and cons, and before/after code. Needs the pi-surface extension.
disable-model-invocation: true
---

# Surface reduce entropy

Code accumulates *entropy*: every option, layer, branch and special case makes the next one easier to justify. This review finds where entropy can be removed, and it goes past cleanup. Assume the code was built to requirements that are negotiable, and find the smallest functional *concessions* that buy the largest reductions in code, concepts or architecture. Then put each finding to the user on the entropy page, where they accept or decline it.

Judge every finding by its *end state*: how much code and how many concepts remain afterward, not how much work the change takes. A 50-line rewrite that deletes 200 lines is a finding; a refactor that reorganizes code without shrinking it is not.

The review is read-only. You leave the code alone; implementing accepted findings is a separate request.

If `surface_entropy_findings` is not available, say the pi-surface extension is not loaded and stop.

## 1. Resolve the scope

- If the user named a target (path, directory, module, symbol, feature), analyze that.
- Otherwise analyze the current changeset: uncommitted changes plus the branch's commits since its merge base with the default branch. Follow the change into surrounding code wherever it builds on complexity that already exists there.
- If neither yields code, ask the user for a target.

## 2. Map complexity to requirements

Read the scope in full, plus its callers and tests. For every source of complexity, name the requirement it serves: each abstraction or layer, config option or flag, branch and special case, error or retry path, piece of state or cache, dependency, generic parameter, and near-duplicate variant.

Check whether each requirement is *load-bearing* instead of assuming it: search for callers of an option, check whether a flag is ever set, look for tests of the edge case, read commit messages and docs for the reason it exists. A requirement with no evidence of use costs nothing to drop.

Done when every non-trivial construct in scope has a named requirement, or is marked as serving none.

## 3. Find concessions

Work through the map:

- **Complexity serving no requirement**: dead code, unused generality, indirection with one implementation, duplicated logic, handling for impossible states. These are zero-concession findings.
- **Live requirements**: ask what the code becomes if the requirement is narrowed, weakened or dropped. Support one format instead of three, fail instead of retry, recompute instead of cache, hard-code the option nobody varies, replace a custom type with plain data, let an existing dependency do the work, merge two paths that differ only in rare cases. Keep the concessions whose payoff is disproportionate to what is given up.
- **Architecture**: look for a whole layer, module, process, persistence mechanism or dependency that exists for one requirement. These are the findings routine cleanup misses, and usually the largest.

Treat these defenses of existing code with skepticism, since each tends to preserve entropy:

- "It already exists": churn is not the measure; the end state is.
- "It's more flexible": flexibility for which concrete caller?
- "It separates concerns": every extra file, type and interface is code too.
- "It's easier to understand": distinguish *simple* (one concept, nothing complected) from *familiar*. Fewer things usually beat more well-organized things.

Two kinds of complexity resist removal. A framework's conventions are a requirement too; a finding that fights the framework usually costs more than it saves. And some things are far cheaper to keep than to retrofit: data that cannot be recovered later (timestamps, audit history), public API contracts, security fundamentals, migrations. A concession that gives one of these up is large however little code it saves.

Done when every requirement in the map has been tested for a concession. Keep only findings whose end state is smaller. If none survives, say in chat that the scope is already minimal and stop without opening the page.

## 4. Size each finding

The *concession* is what accepting gives up, sized by who notices:

| `concession` | Who notices |
|---|---|
| `none` | Nobody; behavior is identical. |
| `internal` | Maintainers and internal callers: an API shape, an unused option, extensibility. Users do not. |
| `edge` | Users, in rare cases: an uncommon input rejected, a less specific error, a slower uncommon path. |
| `feature` | Users, routinely: a capability narrowed or removed, a guarantee weakened. |

A concession that is hard to reverse moves up one size. The *payoff* is the end-state reduction: `lines` is the net lines removed, counted from the code, and `concepts` names each type, file, option, layer or dependency that disappears.

Number findings `F1`, `F2`, … in report order: concession size, smallest first; within a size, largest payoff first.

## 5. Post the findings

Post them with one `surface_entropy_findings` call, giving `scope` as one line naming what you analyzed. The tool's parameter descriptions define the fields. Write page text in short sentences and concrete words: name the input that stops working, the caller that changes, the file that disappears.

- `givesUp` says what is lost and who would notice; `simplification` says what the code becomes. "Config files with US dates fail to load" beats "less lenient parsing".
- `pros` and `cons` are short phrases about accepting: what it removes, then what it gives up and risks.
- `recommended` is `accept` when the payoff clearly earns the concession and `decline` when it does not. For a `feature` concession, recommend accepting only when the case is clear.
- The first visual is the before/after `diff`, taken from the real files with their paths. Read each range before quoting it. Add one or two more views when they make the finding obvious: an `archDiff` or `graph` when a layer or dependency disappears, a `callTree` when a call path gets shorter, a `data` table of inputs with the ones accepting gives up highlighted `bad`.
- `scores` rate accepting on every axis the tool lists, 5 being the better outcome, with a one-line `why` naming the code, caller or input behind it. Keep the anchors the same across findings: the page draws them all on one radar against keeping the code.

A finding written against another's outcome (one deletes code another simplifies) waits: post it in a later call once that decision arrives, with `after` naming the finding it builds on. Drop it when an accepted finding makes it moot.

## 6. Serve the page

The turn ends after posting. The user decides each finding, then presses Send decisions. Messages starting `Surface · entropy ·` carry what to do next.

- **follow-up**: answer from the code, with a fresh visual when that is clearer, using `surface_entropy_reply`. When the answer changes the finding, revise it there.
- **decisions sent**: post any findings that waited on these decisions. Once none waits, write the plan.

## 7. Write the plan

Write the accepted findings to `.scratch/entropy/YYYY-MM-DD-<scope>.md` in the repo root. If `git check-ignore -q .scratch` fails, append `.scratch/` to `.git/info/exclude` rather than editing `.gitignore`.

The plan is a handoff an implementing agent can execute without this session:

- A header with the scope and the net effect: lines and concepts removed, behavior given up.
- One section per accepted finding, in report order: the concession, the files it touches and the files it deletes, the after code, and the check that proves behavior is otherwise unchanged (an existing test, or the test to add first).
- An ordering note when one accepted finding has to land before another.
- One line per declined finding with the user's note, so nobody proposes it again unaware.

Close by stating the plan's path. If the user reopens and re-decides findings later, the next "decisions sent" message supersedes the plan: update it.
