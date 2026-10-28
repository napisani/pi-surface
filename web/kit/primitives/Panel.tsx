import type { ReactNode } from "react";
import { cx } from "../cx.ts";
import css from "./Panel.module.css";

export function Panel({ className, children }: { className?: string; children?: ReactNode }) {
  return <div className={cx(css.panel, className)}>{children}</div>;
}
