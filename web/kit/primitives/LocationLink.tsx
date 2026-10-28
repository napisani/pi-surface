import type { ReactNode } from "react";
import css from "./LocationLink.module.css";

/** A monospace link-style button for a code location, e.g. src/auth.ts:3. */
export function LocationLink({ onClick, children }: { onClick: () => void; children?: ReactNode }) {
  return (
    <button type="button" className={css.link} onClick={onClick}>
      {children}
    </button>
  );
}
