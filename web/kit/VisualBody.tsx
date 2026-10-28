import type { Visual } from "../../src/kit/code.ts";
import { CodeBlock } from "./CodeBlock.tsx";
import { DataTableView } from "./DataTableView.tsx";
import { Mermaid } from "./Mermaid.tsx";
import { UnifiedDiff } from "./UnifiedDiff.tsx";
import css from "./VisualBody.module.css";

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
    case "na":
      return <div className={css.na}>n/a: {visual.reason}</div>;
  }
}
