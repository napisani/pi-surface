import type { ReactNode } from "react";
import css from "./Kv.module.css";

/** A label column beside a value, for facts like Fix, Evidence or Ratings. */
export function Kv({ label, children }: { label: ReactNode; children?: ReactNode }) {
  return (
    <div className={css.kv}>
      <b>{label}</b>
      <div>{children}</div>
    </div>
  );
}
