import type { Category } from "../../src/kit/git.ts";
import css from "./Category.module.css";
import { cx } from "./cx.ts";

export const CATEGORY_LABEL = { impl: "Implementation", test: "Tests", docs: "Docs", config: "Config" } satisfies Record<Category, string>;

export function CategoryTag({ category }: { category: Category }) {
  return <span className={cx(css.tag, css[category])}>{CATEGORY_LABEL[category]}</span>;
}
