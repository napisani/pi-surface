import type { ReactNode } from "react";
import { cx } from "../cx.ts";
import css from "./EmptyState.module.css";

export function EmptyState({ title, small, children }: { title?: ReactNode; small?: boolean; children?: ReactNode }) {
  return (
    <div className={cx(css.empty, small && css.small)}>
      {title ? <b>{title}</b> : null}
      {children}
    </div>
  );
}
