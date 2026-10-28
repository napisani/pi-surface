import type { ReactNode } from "react";
import { cx } from "../cx.ts";
import css from "./CardId.module.css";

/** The item id at the start of a card head, e.g. C3 or R1. */
export function CardId({ tone, children }: { tone: "amber" | "teal" | "violet" | "blue"; children?: ReactNode }) {
  return <span className={cx(css.id, css[tone])}>{children}</span>;
}
