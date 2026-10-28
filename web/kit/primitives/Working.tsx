import type { ReactNode } from "react";
import { Spinner } from "./Spinner.tsx";
import css from "./Working.module.css";

/** A spinner beside a line saying what the agent is doing. */
export function Working({ children }: { children?: ReactNode }) {
  return (
    <div className={css.working}>
      <Spinner /> {children}
    </div>
  );
}
