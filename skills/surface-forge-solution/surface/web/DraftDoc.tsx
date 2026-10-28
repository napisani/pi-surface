// A parsed draft as React elements. The tree came from markdown with raw HTML
// dropped, so the only markup on the page is what these components render.
import { toJsxRuntime, type Components } from "hast-util-to-jsx-runtime";
import { useMemo, type ComponentProps } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import type { Root } from "hast";
import { cx } from "../../../../web/kit/cx.ts";
import md from "../../../../web/kit/Markdown.module.css";
import css from "./DraftDoc.module.css";
import { IdChips } from "./IdChips.tsx";

type SpanProps = ComponentProps<"span"> & { "data-tbd"?: string };

function TbdMark({ id, ids }: { id?: string; ids: string }) {
  const list = ids ? ids.split(",") : [];
  return (
    <span id={id} className={css.tbd}>
      TBD
      {list.length ? (
        <>
          (<IdChips ids={list} separator=", " />)
        </>
      ) : null}
    </span>
  );
}

const COMPONENTS: Partial<Components> = {
  span: ({ "data-tbd": tbd, ...props }: SpanProps) => (tbd === undefined ? <span {...props} /> : <TbdMark id={props.id} ids={tbd} />),
  a: ({ href, children }: ComponentProps<"a">) => (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
};

export function DraftDoc({ tree }: { tree: Root }) {
  const content = useMemo(() => toJsxRuntime(tree, { Fragment, jsx, jsxs, components: COMPONENTS }), [tree]);
  return <article className={cx(md.md, css.doc)}>{content}</article>;
}
