import { memo, type ReactNode } from "react";
import type { Finding } from "../../src/kit/findings.ts";
import { cx } from "./cx.ts";
import css from "./FindingRow.module.css";
import { refLabel } from "./lines.ts";
import sev from "./Severity.module.css";

export interface FindingRowProps {
  finding: Finding;
  on: boolean;
  selected: boolean;
  onToggle(id: string): void;
  onOpen(id: string): void;
  /** Extra items on the meta line, e.g. drafts made from it. */
  meta?: ReactNode;
  /** Shown before the title, e.g. how far its fix got. */
  status?: ReactNode;
  /** A fix is applied: the row reads as done. */
  resolved?: boolean;
}

/** A finding in the review list: checkbox, id and title, where it is, its lens and confidence. */
export const FindingRow = memo(function FindingRow({ finding: f, on, selected, onToggle, onOpen, meta, status, resolved }: FindingRowProps) {
  return (
    <div className={cx(css.row, sev[f.severity], on && css.on, f.dismissed && css.dismissed, resolved && css.resolved)} onClick={() => onOpen(f.id)}>
      <input type="checkbox" checked={selected} disabled={f.dismissed} onClick={(e) => e.stopPropagation()} onChange={() => onToggle(f.id)} />
      <div className={css.main}>
        <div className={css.title}>
          {status ? <span className={css.status}>{status}</span> : null}
          <b>{f.id}</b> <span className={css.titleText}>{f.title}</span>
        </div>
        <div className={css.meta}>
          <span className={css.mono}>{refLabel(f.primary)}</span> · {f.category} · {f.confidence} confidence {meta}
        </div>
      </div>
    </div>
  );
});
