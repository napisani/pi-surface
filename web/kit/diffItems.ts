// The items a pierre CodeView renders for a diff: one per changed file, with one
// annotation per comment, request, finding, question or thread on its lines.
import type { CodeViewDiffItem, DiffLineAnnotation, FileDiffMetadata } from "@pierre/diffs";
import type { Side } from "../../src/kit/code.ts";
import type { PrFile } from "../../src/kit/git.ts";

export interface LineItemRef {
  kind: "thread" | "comment" | "composer" | "finding" | "question" | "request";
  /** The item's stable id: C3, R1, F2, Q4, a GitHub comment id, or "composer". */
  id: string | number;
}

export type LineItemMap = ReadonlyMap<string, DiffLineAnnotation<LineItemRef>[]>;

export const diffItemId = (path: string) => `diff:${path}`;
export const annotationSide = (side: Side) => (side === "LEFT" ? "deletions" : "additions");

export function lineAnnotation(side: Side, line: number, kind: LineItemRef["kind"], id: string | number): DiffLineAnnotation<LineItemRef> {
  return { side: annotationSide(side), lineNumber: line, metadata: { kind, id } };
}

const sameAnnotations = (a: DiffLineAnnotation<LineItemRef>[], b: DiffLineAnnotation<LineItemRef>[]) =>
  a.length === b.length && a.every((x, i) => x.side === b[i].side && x.lineNumber === b[i].lineNumber && x.metadata.kind === b[i].metadata.kind && x.metadata.id === b[i].metadata.id);

/**
 * Returns `previous` when `next` holds the same annotations, and otherwise
 * reuses each unchanged path's array. Selectors return this so an edit to a
 * comment's text, which moves no annotation, re-renders nothing in the diff.
 */
export function stableLineItems(previous: LineItemMap | undefined, next: Map<string, DiffLineAnnotation<LineItemRef>[]>): LineItemMap {
  if (!previous) {
    return next;
  }
  let changed = previous.size !== next.size;
  const out = new Map<string, DiffLineAnnotation<LineItemRef>[]>();
  for (const [path, annotations] of next) {
    const old = previous.get(path);
    if (old && sameAnnotations(old, annotations)) {
      out.set(path, old);
    } else {
      out.set(path, annotations);
      changed = true;
    }
  }
  return changed ? out : previous;
}

// Shared by every file without annotations; nothing mutates it.
const EMPTY: DiffLineAnnotation<LineItemRef>[] = [];

/**
 * One CodeView item per file that has a parsed diff, in file order. An item is
 * reused while its diff, annotations and collapsed state are unchanged; when one
 * of them changes the item gets a new object and the next version.
 */
export function buildDiffItems(
  files: readonly PrFile[],
  patches: ReadonlyMap<string, FileDiffMetadata>,
  lineItems: LineItemMap,
  collapsed: ReadonlySet<string>,
  previous: readonly CodeViewDiffItem<LineItemRef>[] = [],
): CodeViewDiffItem<LineItemRef>[] {
  const before = new Map(previous.map((item) => [item.id, item]));
  const items: CodeViewDiffItem<LineItemRef>[] = [];
  for (const file of files) {
    const fileDiff = patches.get(file.path);
    if (!fileDiff) {
      continue;
    }
    const id = diffItemId(file.path);
    const annotations = lineItems.get(file.path) ?? EMPTY;
    const isCollapsed = collapsed.has(file.path);
    const old = before.get(id);
    if (old && old.fileDiff === fileDiff && old.annotations === annotations && Boolean(old.collapsed) === isCollapsed) {
      items.push(old);
      continue;
    }
    items.push({ id, type: "diff", fileDiff, annotations, collapsed: isCollapsed, version: (old?.version ?? 0) + 1 });
  }
  return items;
}

/** buildDiffItems that remembers its last result, so unchanged items keep their identity. */
export function createDiffItemsBuilder(): (
  files: readonly PrFile[],
  patches: ReadonlyMap<string, FileDiffMetadata>,
  lineItems: LineItemMap,
  collapsed: ReadonlySet<string>,
) => CodeViewDiffItem<LineItemRef>[] {
  let previous: CodeViewDiffItem<LineItemRef>[] = [];
  return (files, patches, lineItems, collapsed) => (previous = buildDiffItems(files, patches, lineItems, collapsed, previous));
}
