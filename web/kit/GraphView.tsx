import { memo, useId, useMemo } from "react";
import type { Graph, GraphTone } from "../../src/kit/code.ts";
import { cx } from "./cx.ts";
import { layoutGraph, NODE_H } from "./graphLayout.ts";
import css from "./GraphView.module.css";

const TONE_CLASS = {
  open: css.open,
  active: css.active,
  done: css.done,
  blocked: css.blocked,
  fog: css.fog,
  warn: css.warn,
  bad: css.bad,
  added: css.added,
  removed: css.removed,
  muted: css.muted,
} satisfies Record<GraphTone, string>;

export interface GraphViewProps {
  graph: Graph;
  /** The node drawn as selected. */
  selected?: string;
  /** Makes nodes clickable. */
  onNode?(id: string): void;
}

/** A graph laid out left to right, nodes colored by tone. */
export const GraphView = memo(function GraphView({ graph, selected, onNode }: GraphViewProps) {
  // Each graph gets its own marker: a shared id would resolve to the first one, which may sit in a hidden tab and not draw.
  const arrow = `arrow-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;
  const layout = useMemo(() => layoutGraph(graph), [graph]);
  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);
  const labels = useMemo(() => new Map(graph.edges.map((e) => [`${e.from}>${e.to}`, e])), [graph]);
  return (
    <div className={css.wrap}>
      <svg className={css.svg} width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} role="img" aria-label="graph">
        <defs>
          <marker id={arrow} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" className={css.arrow} />
          </marker>
        </defs>
        {layout.edges.map((e) => {
          const edge = labels.get(`${e.from}>${e.to}`);
          return (
            <g key={`${e.from}>${e.to}`}>
              <path d={e.path} className={cx(css.edge, edge?.dashed && css.dashed)} markerEnd={`url(#${arrow})`} />
              {edge?.label ? (
                <text x={e.mid.x} y={e.mid.y} className={css.edgeLabel} textAnchor="middle">
                  {edge.label}
                </text>
              ) : null}
            </g>
          );
        })}
        {layout.nodes.map((p) => {
          const node = byId.get(p.id)!;
          const label = node.label.length > 30 ? `${node.label.slice(0, 29)}…` : node.label;
          return (
            <g
              key={p.id}
              className={cx(css.node, TONE_CLASS[node.tone ?? "open"], onNode && css.clickable, selected === p.id && css.selected)}
              transform={`translate(${p.x},${p.y})`}
              onClick={onNode ? () => onNode(p.id) : undefined}
              role={onNode ? "button" : undefined}
              aria-label={onNode ? node.label : undefined}
            >
              <title>{[node.label, node.group, node.note].filter(Boolean).join(" · ")}</title>
              <rect width={p.w} height={NODE_H} rx="6" />
              <text x={p.w / 2} y={NODE_H / 2 + 4} textAnchor="middle">
                {label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
});
