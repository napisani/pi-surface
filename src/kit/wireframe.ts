// A small line-based language for low-fidelity UI sketches, after Chopin's
// wireframe fences. Each line is one part; two spaces of indent nest a child.
// Pure, so the page and the tools share one parser and the Node tests cover it.

export const WIREFRAME_KINDS = [
  "panel",
  "header",
  "row",
  "stack",
  "card",
  "box",
  "grid",
  "title",
  "text",
  "button",
  "badge",
  "disclosure",
  "list",
  "tabs",
  "nav",
  "input",
  "image",
  "fill",
  "lines",
  "icon",
  "divider",
  "note",
] as const;
export type WireframeKind = (typeof WIREFRAME_KINDS)[number];

const isKind = (word: string | undefined): word is WireframeKind => WIREFRAME_KINDS.some((k) => k === word);

const NEEDS_LABEL: ReadonlySet<WireframeKind> = new Set(["title", "text", "badge", "disclosure", "note"]);
const HAS_ITEMS: ReadonlySet<WireframeKind> = new Set(["list", "tabs", "nav"]);
const MAX_LINES = 300;
const MAX_REPEAT = 12;

export interface WireframePart {
  kind: WireframeKind;
  label?: string;
  flags: string[];
  props: Record<string, string>;
  items: string[];
  children: WireframePart[];
  /** 1-based, counted inside the source. */
  line: number;
}

export type WireframeResult = { parts: WireframePart[]; errors: string[] };

const TOKEN = /"((?:[^"\\]|\\.)*)"|(\S+)/g;

function parseLine(text: string, line: number, errors: string[]): WireframePart | undefined {
  const tokens = [...text.matchAll(TOKEN)];
  const kind = tokens[0]?.[2];
  if (!isKind(kind)) {
    errors.push(`line ${line}: unknown part "${kind ?? text}"; use one of ${WIREFRAME_KINDS.join(", ")}`);
    return undefined;
  }
  const part: WireframePart = { kind, flags: [], props: {}, items: [], children: [], line };
  for (const [, quoted, word] of tokens.slice(1)) {
    if (quoted !== undefined) {
      part.label = quoted.replace(/\\"/g, '"');
    } else if (word.startsWith("#")) {
      part.props.id = word.slice(1);
    } else if (word === "->") {
      continue;
    } else if (word.includes("=")) {
      const [key, value] = word.split("=", 2);
      part.props[key] = value;
    } else {
      part.flags.push(word);
    }
  }
  if (NEEDS_LABEL.has(part.kind) && !part.label) {
    errors.push(`line ${line}: ${part.kind} needs a "quoted label"`);
  }
  const repeat = Number(part.props.repeat ?? 1);
  if (!Number.isInteger(repeat) || repeat < 1 || repeat > MAX_REPEAT) {
    errors.push(`line ${line}: repeat must be 1-${MAX_REPEAT}`);
  }
  return part;
}

/** Parses a wireframe; every problem is reported with its line, and parts parse as far as they can. */
export function parseWireframe(source: string): WireframeResult {
  const errors: string[] = [];
  const parts: WireframePart[] = [];
  const lines = source.replace(/\t/g, "  ").split("\n");
  if (lines.length > MAX_LINES) {
    return { parts, errors: [`a wireframe is limited to ${MAX_LINES} lines`] };
  }
  // The open parts by depth; a line nests under the nearest shallower one.
  const stack: { depth: number; part: WireframePart }[] = [];
  lines.forEach((raw, i) => {
    const line = i + 1;
    if (!raw.trim()) {
      return;
    }
    const indent = raw.length - raw.trimStart().length;
    if (indent % 2) {
      errors.push(`line ${line}: indent with two spaces per level`);
      return;
    }
    const depth = indent / 2;
    while (stack.length && stack[stack.length - 1].depth >= depth) {
      stack.pop();
    }
    const parent = stack[stack.length - 1]?.part;
    const text = raw.trim();
    if (text.startsWith("- ")) {
      if (!parent || !HAS_ITEMS.has(parent.kind)) {
        errors.push(`line ${line}: "- item" lines belong under a list, tabs or nav`);
      } else {
        parent.items.push(text.slice(2).trim());
      }
      return;
    }
    if (depth > (stack.length ? stack[stack.length - 1].depth + 1 : 0)) {
      errors.push(`line ${line}: indented more than one level past its parent`);
      return;
    }
    const part = parseLine(text, line, errors);
    if (!part) {
      return;
    }
    (parent ? parent.children : parts).push(part);
    stack.push({ depth, part });
  });
  if (!parts.length && !errors.length) {
    errors.push("a wireframe needs at least one part");
  }
  return { parts, errors };
}
