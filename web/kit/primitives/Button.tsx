import type { ButtonHTMLAttributes } from "react";
import { cx } from "../cx.ts";
import css from "./Button.module.css";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  kind?: "plain" | "primary" | "ghost";
  size?: "small";
  /** Shows the button as the chosen one of a group. */
  on?: boolean;
  wide?: boolean;
}

export function Button({ kind = "plain", size, on, wide, className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cx(css.button, kind !== "plain" && css[kind], size && css[size], on && css.on, wide && css.wide, className)} {...props} />;
}
