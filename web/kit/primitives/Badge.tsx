import type { ReactNode } from "react";
import type { Severity } from "../../../src/kit/findings.ts";
import type { DraftStatus } from "../../../src/kit/github-draft.ts";
import type { Level } from "../../../src/kit/levels.ts";
import type { RoundStatus } from "../../../src/kit/rounds.ts";
import { cx } from "../cx.ts";
import css from "./Badge.module.css";

export type Tone = "neutral" | "link" | "ok" | "warn" | "err" | "info" | "muted" | "teal" | "violet" | "amber" | "amberFill";

const SEVERITY_TONE = { Critical: css.sevCritical, High: css.sevHigh, Medium: css.sevMedium, Low: css.sevLow } satisfies Record<Severity, string>;
/** Risk-style levels: High is the alarming end. */
export const LEVEL_TONE = { High: "err", Medium: "warn", Low: "teal" } satisfies Record<Level, Tone>;
export const DRAFT_TONE = { draft: "amber", posting: "info", posted: "teal", failed: "err" } satisfies Record<DraftStatus, Tone>;
export const ROUND_TONE = { pending: "teal", sent: "info", done: "ok", declined: "muted", "needs-input": "warn" } satisfies Record<RoundStatus, Tone>;

export interface BadgeProps {
  tone?: Tone;
  severity?: Severity;
  mini?: boolean;
  title?: string;
  onClick?: () => void;
  children?: ReactNode;
}

export function Badge({ tone = "neutral", severity, mini, title, onClick, children }: BadgeProps) {
  const className = cx(css.badge, mini && css.mini, severity ? SEVERITY_TONE[severity] : tone !== "neutral" && css[tone]);
  return onClick ? (
    <button type="button" className={className} title={title} onClick={onClick}>
      {children}
    </button>
  ) : (
    <span className={className} title={title}>
      {children}
    </span>
  );
}
