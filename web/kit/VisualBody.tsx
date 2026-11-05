import type { Visual } from "../../src/kit/code.ts";
import { ArchDiffView } from "./ArchDiffView.tsx";
import { CodeBlock } from "./CodeBlock.tsx";
import { DataTableView } from "./DataTableView.tsx";
import { GraphView } from "./GraphView.tsx";
import { HeatmapView } from "./HeatmapView.tsx";
import { MatrixView } from "./MatrixView.tsx";
import { Mermaid } from "./Mermaid.tsx";
import { SandboxedView } from "./SandboxedView.tsx";
import { StateMachineView } from "./StateMachineView.tsx";
import { UnifiedDiff } from "./UnifiedDiff.tsx";
import css from "./VisualBody.module.css";
import { WireframeView } from "./WireframeView.tsx";

/** One visual the agent sent, drawn by its kind. */
export function VisualBody({ visual }: { visual: Visual }) {
  switch (visual.kind) {
    case "mermaid":
      return <Mermaid source={visual.source} />;
    case "data":
      return (
        <>
          {visual.tables.map((t, i) => (
            <DataTableView key={i} table={t} />
          ))}
          {visual.code ? <CodeBlock text={visual.code.text} marked={false} /> : null}
        </>
      );
    case "query":
      return (
        <>
          <CodeBlock text={visual.command} marked={false} />
          <div className={css.gap} />
          <DataTableView table={visual.result} />
        </>
      );
    case "callTree":
      return <pre className={css.pre}>{visual.text}</pre>;
    case "code":
      return <CodeBlock text={visual.text} />;
    case "diff":
      return <UnifiedDiff text={visual.unified} />;
    case "graph":
      return <GraphView graph={visual} />;
    case "matrix":
      return <MatrixView rows={visual.rows} columns={visual.columns} cells={visual.cells} />;
    case "stateMachine":
      return <StateMachineView states={visual.states} transitions={visual.transitions} />;
    case "archDiff":
      return <ArchDiffView before={visual.before} after={visual.after} changed={visual.changed} />;
    case "wireframe":
      return <WireframeView source={visual.source} />;
    case "heatmap":
      return <HeatmapView rows={visual.rows} columns={visual.columns} values={visual.values} />;
    case "view":
      return <SandboxedView html={visual.html} data={visual.data} height={visual.height} />;
    case "na":
      return <div className={css.na}>n/a: {visual.reason}</div>;
  }
}
