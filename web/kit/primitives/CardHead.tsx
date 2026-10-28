import type { ReactNode } from "react";
import css from "./CardHead.module.css";

export function CardHead({ children }: { children?: ReactNode }) {
  return <div className={css.head}>{children}</div>;
}
