# Keyboard behavior

`<leader>` is **`;`**, pressed once and released. Sequences are written without
spaces: `<leader>fk` means `;`, `f`, `k`. Commands are shared across the three
workflows, with contextual bindings for the active tab and pane.

## Interaction

- Pause after a prefix to see which-key hints (250 ms). Fast sequences execute
  immediately. There is no completion timeout.
- Escape cancels a sequence. An invalid continuation cancels without replaying
  that key as a different command. Focus changes, tab changes, and window blur
  cancel pending sequences. Held keys do not repeatedly execute commands.
- Inputs, textareas, contenteditable regions, and composition input own their
  typing. `;`, `j`, and bracket sequences insert text there. Escape leaves the
  editor without deleting its draft. IME confirmation does not submit a question.
- Space and common browser Ctrl shortcuts retain browser behavior. Chords claimed
  by the OS or a browser extension may never reach the page.
- The picker owns its filter input, Up/Down, Enter, and Escape. Every picker uses
  fuzzy subsequence matching, including files, views, commands, and forge choices.
- **Keys** in the header opens command discovery without needing a shortcut.
  It shows stable command IDs and the effective bindings after user overrides.

## Shared commands

| Binding | Action |
|---|---|
| `<leader>fk`, `<leader>fm`, `?` | Fuzzy command/binding picker |
| `<leader>fe` | Fuzzy app-view picker |
| `gwh`, `gwj`, `gwk`, `gwl` | Focus the nearest registered pane left/down/up/right |
| `<leader>v?` | Compose a question about the active context |
| `<leader>ai` | Open the context's agent composer without appending text |
| `<leader>a?` | Append the context reference and a question heading |
| `<leader>aff` | Append the current context reference |
| `<leader>ve` | Compose a scoped edit request, where supported |
| `<leader>ae` | Stage an edit instruction, where supported |

The composer captures its target before focusing the editor. In a diff, a line
selection takes precedence; without one it uses the first visible hunk. The
reference includes path, revision, side, and line range in the request. A
cross-side selection is refused rather than silently changed to one side.

Staging never sends. Use **Send question** or **Queue change request** to submit.
Live review can queue edits; pinned review, walkthrough questions, and forge
follow-ups are read-only. On success the relevant conversation/request view gets
attention. Failure keeps the draft. **Hide · keep draft** closes the composer.
Drafts are kept per context for the lifetime of the page, including when tab or
step navigation unmounts an editor; they do not survive a browser reload.

The `f`, `c`, `v`, and `a` domains follow the Neovim behavior vocabulary. `g` is
reserved for Git, not a new “go” menu. Unsupported LSP, git mutation, and full-repo
search operations are not assigned unrelated actions.

## Code review

| Context | Binding | Action |
|---|---|---|
| App | `<leader>e` | Refresh review without reloading the browser |
| App | `<leader>co` | Open Files |
| Files | `]g` / `[g`, aliases `]c` / `[c` | Next/previous changed hunk |
| Files | `]f` / `[f` | Next/previous file in the visible diff order |
| Files | `<leader>fD` | Fuzzy picker over this base comparison's visible files |
| Files | `<leader>cw` | Cycle unified/split diff |
| Files | `<leader>cT` | Focus the changed-file tree |
| Focused tree | `j` / `k` | Next/previous visible tree row |
| Focused tree | Enter / `l` / `o` | Open file or expand/enter directory; retain tree focus |
| Focused tree | `h` / Backspace | Close directory or move to parent |
| Focused tree | `f` / `F` | Focus / clear file filtering |
| Findings | `]d` / `[d`, `j` / `k` | Next/previous non-dismissed finding |
| Findings | `<leader>fq` | Fuzzy finding picker |
| Walkthrough | `]s` / `[s` | Next/previous step |
| Walkthrough | `<leader>fs` | Fuzzy step picker |
| Walkthrough | `gf` | Open the step's code in Files, when in the diff |

Hunk navigation starts at the first changed line, skips context, crosses to the
next file's first hunk or previous file's last hunk, and stops at the boundary.
It works with virtualized split and unified diffs, including deleted files.
Hidden Files tabs stay mounted but have no active keyboard commands.

## PR feedback

- `<leader>e` refreshes feedback; `<leader>co` opens Changes.
- Feedback uses `j` / `k` and `]d` / `[d` in the displayed item order.
  `<leader>fq` opens a fuzzy feedback picker.
- `<leader>v?` and agent staging commands target the active item's discussion.
- Changes uses the shared hunk/file motions and `<leader>cw`.
  `<leader>ff` picks files in this view, which compares against the opening
  snapshot, not necessarily a merge base.
- Fix decisions, posting replies, committing, and pushing keep their explicit
  controls. Navigation and staging do not perform these operations.

## Forge

- `<leader>fq` picks a question; `<leader>fo` picks an option;
  `<leader>fv` picks a comparison lens.
- Option selection is local until **Submit**. Settled questions cannot be
  answered again through the picker; use the existing Revisit control first.
- `<leader>v?` and staging commands use the active question and selected option.
  A follow-up does not submit an answer or approve a draft.
- Overview has only app-level commands, not the hidden question's bindings.

## User configuration

Create `~/.pi/agent/surface-keybindings.json`. The surface host loads this once
when its loopback server starts and serves it to every workflow, independent of
browser ports. Restart the surface server after editing it, then reload pages.
The file is optional; this implementation does not create or overwrite it.

```json
{
  "leader": ";",
  "bindings": {
    "review.changes.next": ["]g", "]c", "]n"],
    "review.changes.previous": ["[g", "[c"],
    "tour.next": ["]s"],
    "surface.pane.down": []
  }
}
```

An entry **replaces** that command's default bindings. An empty array unbinds it;
it remains available in command search. Omitted IDs retain their defaults.
Use the command picker to copy an ID. Workflow-specific IDs only take effect
when that workflow/context registers them.

Literal keys are sequences; angle brackets name special keys or chords:
`<Enter>`, `<Space>`, `<Ctrl+;>`. A leader must be exactly one key/chord.
`<leader>` expands to the configured leader inside a binding. For example,
`"leader": "<Ctrl+;>"` uses Ctrl+semicolon, then unmodified continuation keys.

Malformed files, same-priority collisions, and command/prefix ambiguities disable
shortcuts with a visible error rather than silently choosing a winner. Higher
priority contexts override lower ones for the same sequence, including when the
higher-priority command is disabled. A disabled command shows its reason and
never falls through. The page remains usable by mouse if shortcuts are disabled.

## Adding commands to a workflow or kit component

The shared shell installs `KeyboardProvider` once. Components register commands
through `useCommands` from `web/kit/keyboardContext.ts`; the hook unregisters on
unmount and invokes the latest callback. IDs must be stable and unique among
active commands. A `disabled` string explains why an action is unavailable.

```tsx
useCommands([
  {
    id: "review.refresh",
    label: "Refresh review",
    keys: ["<leader>e"],
    disabled: refreshing ? "Refreshing" : undefined,
    run: refresh,
  },
]);
```

Wrap each tab in `<KeyboardScope name="files" active={tab === "files"}>`.
This activation is required even when hidden content stays mounted. Nested
scopes have higher priority. `useKeyboardPane(ref, label)` marks an existing pane
for directional focus and returns whether it owns local commands; pass that
boolean and priority offset `1` to `useCommands` for pane-local bindings.

Use `useKeyboard()?.pick(title, choices)` for fuzzy choices. Keep destructive
operations behind explicit confirmation. Use `AgentComposer` for staged
questions/edits and `useDraft` for input state that must survive navigation.
New components should not add document key listeners or handle navigation in
bubbling `onKeyDown` callbacks. Local text-input submission remains local.

Vim operators, counts, macros, a visual remapping editor, and cross-tmux focus
are outside this implementation.
