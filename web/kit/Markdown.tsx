// Markdown written by the agent or GitHub reviewers. react-markdown builds React
// elements and skips raw HTML in the input, so the text cannot put markup on the page.
import type { Element } from "hast";
import type { ComponentProps } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cx } from "./cx.ts";
import css from "./Markdown.module.css";

const REMARK_PLUGINS = [remarkGfm];

const isSuggestion = (node: Element | undefined) => {
  const code = node?.children[0];
  const classes = code?.type === "element" ? code.properties.className : undefined;
  return Array.isArray(classes) && classes.includes("language-suggestion");
};

const COMPONENTS: Components = {
  // GitHub's ```suggestion fence proposes replacement lines; label it so it reads as one.
  pre: ({ node, children }: ComponentProps<"pre"> & { node?: Element }) =>
    isSuggestion(node) ? (
      <>
        <div className={css.suggestionLabel}>Suggested change</div>
        <pre className={css.suggestion}>{children}</pre>
      </>
    ) : (
      <pre>{children}</pre>
    ),
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
};

export function Markdown({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cx(css.md, className)}>
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={COMPONENTS}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
