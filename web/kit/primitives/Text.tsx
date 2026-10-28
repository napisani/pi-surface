import type { ReactNode } from "react";
import { cx } from "../cx.ts";
import css from "./Text.module.css";

export interface TextProps {
  tone?: "faint" | "dim" | "err" | "ok" | "warn" | "ink";
  mono?: boolean;
  small?: boolean;
  strong?: boolean;
  title?: string;
  className?: string;
  children?: ReactNode;
}

export function Text({ tone, mono, small, strong, title, className, children }: TextProps) {
  return (
    <span className={cx(tone && css[tone], mono && css.mono, small && css.small, strong && css.strong, className)} title={title}>
      {children}
    </span>
  );
}
