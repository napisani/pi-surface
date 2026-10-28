import type { ReactNode } from "react";
import css from "./Section.module.css";

export function Section({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <section className={css.section}>
      <h4>{title}</h4>
      {children}
    </section>
  );
}
