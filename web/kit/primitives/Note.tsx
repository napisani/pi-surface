import type { ReactNode } from "react";
import css from "./Note.module.css";

export function Note({ children }: { children?: ReactNode }) {
  return <div className={css.note}>{children}</div>;
}
