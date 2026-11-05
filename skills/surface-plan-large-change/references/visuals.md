# Visuals

Each visual earns its place by showing something the prose cannot. Pick per question; the page renders every kind below natively except `view`.

| The question is about | Show |
|---|---|
| How components connect, now and after | `archDiff`: current and target graphs; nodes only in the target read as added, only in the current as removed, ids in `changed` as changed |
| Dependencies, order, ownership | `graph`: nodes with tones, edges left to right |
| Options measured against criteria; spike results | `matrix`: rows are options, columns criteria, cells toned `good`/`bad`/`warn` |
| Where change or risk concentrates | `heatmap`: modules by slices or decisions |
| Behavior that can go wrong across states | `stateMachine`: one initial state, the bad state or transition marked; the user steps through it |
| A screen or flow the user will see | `wireframe` |
| A request or message path | `mermaid` sequenceDiagram |
| A data model | `mermaid` erDiagram plus a `data` table of example rows |
| A code change | `diff` or `code` with `+`/`-` lines |

Every visual has a short `label` and a `look` line naming the one thing to notice, and uses real names from the code.

## Wireframes

One part per line; two spaces of indent nest a part inside the one above. A line is a kind, then any of: a `"quoted label"`, flags, `key=value` properties, `#id`.

- Containers: `panel`, `header`, `row`, `stack`, `card`, `box`, `grid` (`cols=2..6`).
- Content: `title`, `text` (`strong`), `button` (`primary`), `badge`, `disclosure`, `input`, `image` (`ratio=wide|square`), `fill`, `lines` (`n=`), `icon`, `divider`, `note`.
- Lists: `list`, `tabs`, `nav` (`vertical`, `active=2`) hold `- item` lines.
- `w=1..12` is a part's share of its row; `h=xs..xl` a rough height; `repeat=3` draws a part three times; `flush` makes a header touch the frame.

Draw the shape, not the copy: label titles, navigation and primary actions; use `lines` for body text.

```
header flush
  title "Usage"
  button "Export" primary
row
  nav vertical active=1
    - By tenant
    - By endpoint
  stack w=9
    grid cols=3
      card repeat=3
        lines n=2
```

## Agent-built views

When no kind above answers the question (an explorer the user needs to poke at, a simulation with sliders), write a `view`: one self-contained HTML page with inline `<script>` and `<style>`. It runs sandboxed with no network, so it cannot fetch anything; put what it needs in `data`, which arrives as `window.surfaceData` and a `surface-data` event. Keep it under 200,000 characters and readable on a dark background. Reach for it rarely; a canned kind the user already knows reads faster.
