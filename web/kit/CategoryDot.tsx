import type { Category } from "../../src/kit/git.ts";
import css from "./Category.module.css";
import { cx } from "./cx.ts";

/** The colored dot for a file's category: implementation, tests, docs or config. */
export function CategoryDot({ category }: { category: Category }) {
  return <span className={cx(css.dot, css[category])} />;
}
