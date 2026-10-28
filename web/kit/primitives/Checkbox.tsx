import type { ReactNode } from "react";
import css from "./Checkbox.module.css";

export function Checkbox({ checked, disabled, onChange, children }: { checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void; children?: ReactNode }) {
  return (
    <label className={css.check}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} /> {children}
    </label>
  );
}
