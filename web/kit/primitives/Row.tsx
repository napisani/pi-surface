import type { ReactNode } from "react";
import { cx } from "../cx.ts";
import css from "./Row.module.css";

export function Row({ end, flush, className, children }: { end?: boolean; flush?: boolean; className?: string; children?: ReactNode }) {
  return <div className={cx(css.row, end && css.end, flush && css.flush, className)}>{children}</div>;
}
