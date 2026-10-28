import type { ReactNode } from "react";
import { cx } from "../../../../web/kit/cx.ts";
import css from "./ForgeBanner.module.css";

/** A settled state, in green, or something in progress, in blue, with an action at the end. */
export function ForgeBanner({ tone = "green", children }: { tone?: "green" | "blue"; children?: ReactNode }) {
  return <div className={cx(css.banner, tone === "blue" && css.blue)}>{children}</div>;
}
