import { Fragment, useMemo, type CSSProperties, type ReactNode } from "react";
import { parseWireframe, type WireframePart } from "../../src/kit/wireframe.ts";
import { cx } from "./cx.ts";
import css from "./WireframeView.module.css";

const count = (part: WireframePart, key: string, fallback: number, max: number) => {
  const n = Number(part.props[key] ?? fallback);
  return Number.isInteger(n) ? Math.min(Math.max(n, 1), max) : fallback;
};

function Items({ part, vertical }: { part: WireframePart; vertical: boolean }) {
  const items = part.items.length ? part.items : Array.from({ length: count(part, "n", 3, 8) }, () => "");
  const active = count(part, "active", 0, items.length);
  return (
    <div className={cx(vertical ? css.vlist : css.hlist, part.kind === "tabs" && css.tabs)}>
      {items.map((item, i) => (
        <span key={i} className={cx(css.item, i + 1 === active && css.activeItem)}>
          {item || <i className={css.bar} />}
        </span>
      ))}
    </div>
  );
}

/** A part that holds text. */
function textLeaf(p: WireframePart): ReactNode {
  switch (p.kind) {
    case "title":
      return <div className={css.title}>{p.label}</div>;
    case "text":
      return <div className={cx(css.text, p.flags.includes("strong") && css.strong)}>{p.label}</div>;
    case "button":
      return <span className={cx(css.button, p.flags.includes("primary") && css.primary)}>{p.label ?? "Button"}</span>;
    case "badge":
      return <span className={css.badge}>{p.label}</span>;
    case "disclosure":
      return <div className={css.text}>▸ {p.label}</div>;
    case "input":
      return <div className={css.input}>{p.label ?? ""}</div>;
    case "note":
      return <div className={css.note}>✎ {p.label}</div>;
    default:
      return placeholderLeaf(p);
  }
}

/** A part drawn as a placeholder shape or a list of items. */
function placeholderLeaf(p: WireframePart): ReactNode {
  switch (p.kind) {
    case "image":
      return <div className={cx(css.image, p.props.ratio === "wide" && css.wide, p.props.ratio === "square" && css.square)} />;
    case "fill":
      return <div className={css.fill} />;
    case "lines":
      return (
        <div className={css.lines}>
          {Array.from({ length: count(p, "n", 2, 12) }, (_, i) => (
            <i key={i} className={css.bar} />
          ))}
        </div>
      );
    case "icon":
      return <i className={css.icon} />;
    case "divider":
      return <hr className={css.divider} />;
    case "list":
      return <Items part={p} vertical />;
    case "tabs":
      return <Items part={p} vertical={false} />;
    case "nav":
      return <Items part={p} vertical={p.flags.includes("vertical")} />;
    default:
      return null;
  }
}

function Part({ part }: { part: WireframePart }) {
  const repeat = count(part, "repeat", 1, 12);
  const share = part.props.w ? { flex: `${count(part, "w", 1, 12)} 1 0` } : undefined;
  const height = part.props.h ? css[`h_${part.props.h}`] : undefined;
  const size = part.props.width ? css[`w_${part.props.width}`] : undefined;
  const container = ["panel", "header", "row", "stack", "card", "box", "grid"].includes(part.kind);
  const style: CSSProperties = { ...share };
  if (part.kind === "grid") {
    style.gridTemplateColumns = `repeat(${count(part, "cols", 3, 6)},1fr)`;
  }
  const body = container ? (
    <div className={cx(css[part.kind], part.flags.includes("flush") && css.flush, part.flags.includes("shaded") && css.shaded, height, size)} style={style}>
      {part.label && part.kind !== "row" ? <div className={css.caption}>{part.label}</div> : null}
      {part.children.map((child, i) => (
        <Part key={`${child.line}:${i}`} part={child} />
      ))}
    </div>
  ) : (
    <div style={share} className={height}>
      {textLeaf(part)}
    </div>
  );
  return (
    <>
      {Array.from({ length: repeat }, (_, i) => (
        <Fragment key={i}>{body}</Fragment>
      ))}
    </>
  );
}

/** A low-fidelity sketch drawn from the wireframe language; parse errors show instead of a broken drawing. */
export function WireframeView({ source }: { source: string }) {
  const { parts, errors } = useMemo(() => parseWireframe(source), [source]);
  if (errors.length) {
    return (
      <ul className={css.errors}>
        {errors.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
    );
  }
  return (
    <div className={css.frame}>
      {parts.map((part, i) => (
        <Part key={`${part.line}:${i}`} part={part} />
      ))}
    </div>
  );
}
