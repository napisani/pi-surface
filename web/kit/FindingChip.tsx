import type { Finding } from "../../src/kit/findings.ts";
import { cx } from "./cx.ts";
import css from "./FindingChip.module.css";
import sev from "./Severity.module.css";

/** The chip a diff line shows for a finding on it. */
export function FindingChip({ finding, onOpen }: { finding: Finding; onOpen(): void }) {
  return (
    <button type="button" className={cx(css.chip, sev[finding.severity])} onClick={onOpen}>
      <b>{finding.id}</b> {finding.severity} · {finding.title}
      <span className={css.open}>open finding →</span>
    </button>
  );
}
