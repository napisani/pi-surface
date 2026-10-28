import type { ReactNode } from "react";
import { cx } from "../cx.ts";
import css from "./Card.module.css";

export type Accent = "draft" | "reply" | "posted" | "assisting" | "composer" | "question" | "request" | "fix" | "attention" | "remote" | "empty" | "commit" | "committed" | "failed";

export function Card({ accent, muted, faded, children }: { accent?: Accent; muted?: boolean; faded?: boolean; children?: ReactNode }) {
  return <div className={cx(css.card, accent && css[accent], muted && css.muted, faded && css.faded)}>{children}</div>;
}
