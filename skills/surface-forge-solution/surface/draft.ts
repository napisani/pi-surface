// Parses a spec or RFC draft once: markdown to an HTML syntax tree with each
// TBD(D4) marker turned into a span, plus the h2/h3 outline with TBD counts and
// the list of markers. DraftDoc renders the tree; nothing here builds HTML text.
import type { Element, ElementContent, Root, RootContent, Text } from "hast";
import { toHast } from "mdast-util-to-hast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

export interface OutlineEntry {
  id: string;
  level: 2 | 3;
  title: string;
  tbds: number;
}

export interface TbdMark {
  id: string;
  /** Decision ids the marker waits on; empty when no question covers it yet. */
  ids: string[];
  /** What is missing: the text after the marker, to the end of its sentence. */
  text: string;
  section: string;
}

/** The h2 and h3 the walk is inside, which a TBD counts toward. */
interface OpenSections {
  2: OutlineEntry | null;
  3: OutlineEntry | null;
}

export interface ParsedDraft {
  tree: Root;
  outline: OutlineEntry[];
  tbds: TbdMark[];
}

const TBD = /\bTBD(?:\(([^)]*)\))?/g;
const MAX_SNIPPET = 140;
// The elements whose text a TBD snippet is read from.
const BLOCKS = new Set(["p", "li", "td", "th", "h1", "h2", "h3", "h4", "h5", "h6"]);
const SKIP = new Set(["code", "pre"]);
const processor = unified().use(remarkParse).use(remarkGfm);

function plainText(node: Root | RootContent): string {
  if (node.type === "text") {
    return node.value;
  }
  if (node.type === "element" && node.tagName === "br") {
    return " ";
  }
  return "children" in node ? node.children.map(plainText).join("") : "";
}

function snippet(after: string): string {
  const rest = after.replace(/^\s*:?\s*/, "");
  const end = rest.search(/\.(\s|$)/);
  const text = end < 0 ? rest : rest.slice(0, end + 1);
  return text.length > MAX_SNIPPET ? `${text.slice(0, MAX_SNIPPET - 1)}…` : text;
}

/** `prefix` keeps the ids of two drafts on one page apart, e.g. "spec" and "rfc". */
export function parseDraft(markdown: string, prefix: string): ParsedDraft {
  // remark-gfm only extends the parser, so the parsed tree needs no transform pass.
  const tree = toHast(processor.parse(markdown));
  if (tree.type !== "root") {
    throw new Error("markdown did not parse to a document");
  }
  const outline: OutlineEntry[] = [];
  const tbds: TbdMark[] = [];
  const open: OpenSections = { 2: null, 3: null };
  // Which TBD in its block a marker is, so its snippet comes from the block's whole text.
  const seen = new Map<Element, number>();

  /** An h2 or h3 gets an id and an outline entry, and becomes the section later TBDs count toward. */
  const visitHeading = (element: Element) => {
    if (element.tagName !== "h2" && element.tagName !== "h3") {
      return;
    }
    const level = element.tagName === "h2" ? 2 : 3;
    const entry: OutlineEntry = { id: `${prefix}-h-${outline.length}`, level, title: plainText(element), tbds: 0 };
    element.properties.id = entry.id;
    outline.push(entry);
    open[level] = entry;
    if (level === 2) {
      open[3] = null;
    }
  };

  const mark = (text: Text, block: Element | undefined): ElementContent[] => {
    const parts: ElementContent[] = [];
    let last = 0;
    for (const match of text.value.matchAll(TBD)) {
      if (match.index > last) {
        parts.push({ type: "text", value: text.value.slice(last, match.index) });
      }
      last = match.index + match[0].length;
      const id = `${prefix}-tbd-${tbds.length}`;
      const ids = (match[1] ?? "").split(/[\s,]+/).filter(Boolean);
      let after = text.value.slice(last);
      if (block) {
        const n = seen.get(block) ?? 0;
        seen.set(block, n + 1);
        const whole = plainText(block);
        const found = [...whole.matchAll(TBD)][n];
        if (found) {
          after = whole.slice(found.index + found[0].length);
        }
      }
      tbds.push({ id, ids, text: snippet(after), section: (open[3] ?? open[2])?.title ?? "" });
      for (const entry of [open[2], open[3]]) {
        if (entry) {
          entry.tbds++;
        }
      }
      parts.push({ type: "element", tagName: "span", properties: { id, dataTbd: ids.join(",") }, children: [] });
    }
    if (!parts.length) {
      return [text];
    }
    if (last < text.value.length) {
      parts.push({ type: "text", value: text.value.slice(last) });
    }
    return parts;
  };

  const walk = (parent: Element, block: Element | undefined) => {
    const children: ElementContent[] = [];
    for (const child of parent.children) {
      if (child.type === "text") {
        children.push(...mark(child, block));
      } else if (child.type === "element" && !SKIP.has(child.tagName)) {
        visitHeading(child);
        walk(child, BLOCKS.has(child.tagName) ? child : block);
        children.push(child);
      } else {
        children.push(child);
      }
    }
    parent.children = children;
  };
  // Markdown puts all text inside block elements, so the root's own children need no marking.
  for (const child of tree.children) {
    if (child.type === "element" && !SKIP.has(child.tagName)) {
      visitHeading(child);
      walk(child, BLOCKS.has(child.tagName) ? child : undefined);
    }
  }
  return { tree, outline, tbds };
}
