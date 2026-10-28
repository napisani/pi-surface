# pi-surface

Pi extension that hosts skill-defined browser workflows. One loopback server
per session serves a page per workflow; page actions come back to the agent
as `Surface · <workflow> ·` messages that start a turn, and the agent answers
through that workflow's `surface_<workflow>_*` tools.

Workflows today:

| Skill | Workflow | Opening tool |
|---|---|---|
| `surface-forge-solution` | `forge`: design decisions, drafts and their approval | `surface_forge_ask` |
| `surface-code-review` | `review`: diffs, change requests, findings, walkthrough, GitHub comments | `surface_review_open` |
| `surface-pr-feedback` | `feedback`: triage, fix rounds, commits, pushes, replies | `surface_feedback_open` |

## Layout

- `src/host/` — no Pi imports: JSON Patch subset (`patch.ts`, including the
  copy-on-write `applyPatchImmutable` the page uses), typed pointers
  (`ptr.ts`), `Store`, the workflow contract (`workflow.ts`), TypeBox decoding
  of page input (`decode.ts`), the `Surface` that runs workflows and replays
  their state (`surface.ts`), the server (`server.ts`), and the command runner
  (`runner.ts`).
- `src/kit/` — shared Node-side pieces workflows build on: state helpers for
  threads, tasks, request rounds and GitHub drafts; code refs, revisions and
  visuals; git helpers and the blob route; TypeBox schemas; prop types for
  the component catalog.
- `web/kit/` — the React page kit: `shell.tsx` (`mountWorkflow`: the state
  stream, the store, toasts, the outer error boundary), `store.ts` (the page
  store, `SurfaceProvider`, `createSurfaceHooks<S, A>()`, `usePending`),
  `hooks/` (blob and diff loading, URL-hash and localStorage state, one shared
  keydown listener, jumping a `CodeView` to a line), `primitives/` (Button,
  Badge, Card, Panel, Row and the other building blocks), `theme.css`, and
  the dev-task components (diffs and code refs, file tree, markdown, visuals,
  threads, rounds, drafts, findings, tour, commit plans, scored options).
  One exported component per PascalCase `.tsx`, each with its own
  `.module.css`.
- `skills/<skill>/surface/` — one workflow each: `workflow.ts` (definition
  and tools), `state.ts`, `actions.ts` (TypeBox schemas for page actions and
  what each does), `session.ts`, workflow-only git/gh calls, `web/` (the page:
  `main.tsx`, `hooks.ts` with the workflow's typed `useSelect` and `usePost`,
  and its components, composed from the kit) and `test/`.
- `extension/index.ts` — Pi wiring: tool registration and activation,
  replay on resume, `/surface`, the message renderer, and the raw page URL of
  each workflow with state, shown under the editor (resume starts the server
  to show it). The package manifest declares both the extension and its skills;
  `pi install` loads them together. `prepare` builds the browser bundles even
  when Pi installs only production dependencies, so esbuild is a runtime
  dependency.
- `scripts/dev-server.ts` — one workflow's page with fixtures, a fake `gh`
  and a scripted agent; no Pi, no GitHub. `DEV_WORKFLOW` picks it.
- `scripts/smoke-rpc.ts` — real Pi and a real model; `SMOKE_WORKFLOW` picks it.

## Adding a workflow

Add `skills/<skill>/SKILL.md` and `skills/<skill>/surface/` with a
`workflow.ts` that exports `defineWorkflow({...})`, add it to `WORKFLOWS` in
`extension/index.ts` and a `<id>=skills/<skill>/surface/web/main.tsx` entry to
the `build` script, and compose its page from `web/kit/`: `main.tsx` calls
`mountWorkflow`, and `hooks.ts` calls `createSurfaceHooks<State, Action>()`.
The package discovers skills under `skills/`. A tool name, parameter, or message
prefix change needs the matching SKILL.md edit. Keep packaged skills
self-contained, with relative references and no required user-installed skills.
Exactly one tool sets `opens: true`. A component or state helper goes into the
kit when it renders a general dev concept.

## Invariants

- Every state change is a list of patch ops: applied by the workflow's
  `Store`, persisted as one `surface-ops` entry `{ workflow, ops }`, and
  broadcast on that workflow's event stream. Resume replays the active
  branch's entries per workflow, so never mutate state outside `ctx.commit`.
- Only a workflow's opening tool is declared until it opens or resume finds
  state for it; tools are never switched off during a session.
- State ops are built with typed pointers (`at<State>()(...)`) so segments and
  values are checked by `tsc`; `test/host/ptr.types.ts` guards the types.
- The server binds 127.0.0.1 only, requires the per-session path token,
  checks `Host` on every request, and `Origin` and JSON content type on every
  POST. Keep all three.
- Browser input reaches state only through the workflow's `parseAction`,
  which decodes it against that action type's TypeBox schema (`decodeAction`)
  before anything reads it. External JSON (gh output) is decoded the same way.
- Blob reads go through `src/kit/git.ts`: paths are checked before they reach
  git, revisions the page lacks are refused, and working-tree reads resolve
  symlinks and stay inside the worktree.
- Markdown from the agent or GitHub never becomes raw HTML: react-markdown
  runs without `rehype-raw`, the forge draft is parsed to a syntax tree with
  raw HTML dropped (`surface/draft.ts`), and `dangerouslySetInnerHTML` appears
  nowhere. Mermaid's strict-mode SVG is the one string set as `innerHTML`.
- Only a user's click writes outside the worktree: posting to GitHub,
  resolving threads, committing and pushing. Agent tools write drafts and
  proposals only.
- Diffs and file contents are never stored in state; routes read them from
  the worktree. Diff commands pin `--src-prefix=a/ --dst-prefix=b/`.
- Browser code imports only types, or modules without Node imports, from
  `src/` and workflow folders; `npm run build` fails otherwise.

### Pages

- The server's state is the single source of truth. The page store holds a
  read-only copy and changes it only by applying server deltas with
  `applyPatchImmutable`, which gives new identities only to objects on a
  changed path, so selectors and `memo` skip everything else.
- The store reaches components through a context whose value never changes;
  components subscribe with `useSelect`, whose selector must return a stable
  reference (select a slice, derive filtered arrays with `useMemo`).
- Kit components never import a workflow's state or action types; they take
  kit types as props and use only workflow-blind hooks.
- Every non-primitive prop passed to a pierre component is defined at module
  scope or memoized. Each diff annotation's metadata is a `LineItemRef` naming
  one item by id, and a diff item's `version` changes exactly when its
  annotations or collapsed state do (`web/kit/diffItems.ts`).
- Tabs hide with `Activity`, except the tabs holding a pierre `CodeView`,
  which hide with CSS: `CodeView` builds its viewer in a callback ref.
- Navigation state (tab, selected item, step) lives in the URL hash, so a
  reload lands in the same place; view preferences live in localStorage under
  `surface:v1:`.
- `web/kit/theme.css` is the only global CSS: custom properties, a reset and
  base element styles. Everything else is a CSS module.
- React code follows the applicable rules of the `vercel-react-best-practices`
  skill in `.agents/skills/`: no barrel files, mermaid loaded lazily, one
  shared listener per global event, ternaries rather than `&&` in JSX, no
  components defined inside components, id lookups through `indexById`.

## Validation

```bash
npm ci && npm run check             # typecheck + bundle + node --test + test:web
npm run test:web                    # component tests: tsx loader, happy-dom, Testing Library
npm run lint                        # oxlint with the shared catalog (pub/lint/rules.yaml)
node scripts/dev-server.ts          # click through a page without Pi (DEV_WORKFLOW=forge|review|feedback)
SMOKE_WORKFLOW=review node scripts/smoke-rpc.ts   # live: spends model calls
pi -e ./extension/index.ts --skill ./skills/surface-code-review
```

Tests use temporary git repositories and a fake `gh` on `PATH`, so they
never reach GitHub. `npm test` runs `.ts` files with Node's type stripping, so
only erasable syntax is allowed there and those files must not contain JSX;
pure page logic (`lineItems.ts`, `stage.ts`, `draft.ts`, `diffItems.ts`) is
tested that way. `npm run test:web` runs `*.test.tsx` next to the components
through tsx, with `test/web/dom.ts` registering happy-dom and stubbing CSS
imports (a module's class names read back as their keys). Pierre and mermaid
rendering are checked by hand on the dev server, not in tests.

In the development monorepo, lint config is generated: edit
`pub/lint/rules.yaml` and run
`deno run --allow-read --allow-write --allow-import pub/lint/sync-lint-config.ts`
from the monorepo root, which rewrites `.oxlintrc.json` and the vendored
`tools/oxlint/anti-slop/`. Never edit those by hand. A standalone clone includes
the generated config and plugin so `npm run lint` needs no monorepo files.
