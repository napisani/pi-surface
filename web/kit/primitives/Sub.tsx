import type { ReactNode } from "react";
import css from "./Sub.module.css";

export function Sub({ children }: { children?: ReactNode }) {
  return <div className={css.sub}>{children}</div>;
}
