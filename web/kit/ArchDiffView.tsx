import { useMemo } from "react";
import type { Graph, GraphNode, GraphTone } from "../../src/kit/code.ts";
import css from "./ArchDiffView.module.css";
import { GraphView } from "./GraphView.tsx";

function toneOf(node: GraphNode, other: ReadonlySet<string>, changed: ReadonlySet<string>, missing: GraphTone): GraphTone {
  if (!other.has(node.id)) {
    return missing;
  }
  return changed.has(node.id) ? "warn" : (node.tone ?? "muted");
}

/** Tones each side: only-before reads removed, only-after added, named ids changed. */
export function archDiffGraphs(before: Graph, after: Graph, changed: readonly string[] = []) {
  const inBefore = new Set(before.nodes.map((n) => n.id));
  const inAfter = new Set(after.nodes.map((n) => n.id));
  const changedIds = new Set(changed);
  const toned = (graph: Graph, other: ReadonlySet<string>, missing: GraphTone): Graph => ({ ...graph, nodes: graph.nodes.map((n) => ({ ...n, tone: toneOf(n, other, changedIds, missing) })) });
  return { before: toned(before, inAfter, "removed"), after: toned(after, inBefore, "added") };
}

/** Current and target architecture side by side, with what changes highlighted. */
export function ArchDiffView({ before, after, changed }: { before: Graph; after: Graph; changed?: readonly string[] }) {
  const graphs = useMemo(() => archDiffGraphs(before, after, changed), [before, after, changed]);
  const counts = {
    added: graphs.after.nodes.filter((n) => n.tone === "added").length,
    removed: graphs.before.nodes.filter((n) => n.tone === "removed").length,
    changed: graphs.after.nodes.filter((n) => n.tone === "warn").length,
  };
  return (
    <div>
      <div className={css.legend}>
        <span className={css.added}>+{counts.added} added</span>
        <span className={css.removed}>−{counts.removed} removed</span>
        <span className={css.changed}>~{counts.changed} changed</span>
      </div>
      <div className={css.sides}>
        <section>
          <h4>Current</h4>
          <GraphView graph={graphs.before} />
        </section>
        <section>
          <h4>Target</h4>
          <GraphView graph={graphs.after} />
        </section>
      </div>
    </div>
  );
}
