import type { ReactNode } from "react";
import { Sub } from "./Sub.tsx";
import css from "./TaskBar.module.css";

/** A tab's heading row: title and description on the left, actions on the right. */
export function TaskBar({ title, sub, children }: { title: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className={css.taskbar}>
      <div className={css.main}>
        <h2>{title}</h2>
        {sub ? <Sub>{sub}</Sub> : null}
      </div>
      {children}
    </div>
  );
}
