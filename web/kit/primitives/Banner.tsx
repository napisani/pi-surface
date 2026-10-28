import type { ReactNode } from "react";
import { cx } from "../cx.ts";
import css from "./Banner.module.css";

export function Banner({ tone, children }: { tone: "warn" | "err" | "run" | "info" | "done"; children?: ReactNode }) {
  return <div className={cx(css.banner, css[tone])}>{children}</div>;
}
