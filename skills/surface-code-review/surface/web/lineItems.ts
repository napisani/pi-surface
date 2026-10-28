// Which items sit on which diff lines of the review's Files tab. Pure, so the
// Node tests cover it; FilesTab keeps the result stable with stableLineItems.
import type { DiffLineAnnotation } from "@pierre/diffs";
import { sideOf, type Anchor, type Rev, type Side } from "../../../../src/kit/code.ts";
import type { Category, PrFile } from "../../../../src/kit/git.ts";
import { lineAnnotation, stableLineItems, type LineItemMap, type LineItemRef } from "../../../../web/kit/diffItems.ts";
import type { ChangeRequest, RemoteComment, ReviewState } from "../state.ts";

export type Mode = "live" | "pinned";

/** The revision a diff side shows: a live review's right side is the working tree. */
export function sideRev(mode: Mode, side: Side): Rev {
  if (side === "LEFT") {
    return "base";
  }
  return mode === "live" ? "work" : "head";
}

export const where = (a: Anchor) => `${a.path}:${a.startLine ? `${a.startLine}–` : ""}${a.line}${a.side === "LEFT" ? " (old)" : ""}`;

export interface FileFilters {
  text: string;
  categories: ReadonlySet<Category>;
  /** Only files with a comment, request, question or finding. */
  onlyNoted: boolean;
  hideViewed: boolean;
}

export const ALL_CATEGORIES: readonly Category[] = ["impl", "test", "docs", "config"];
export const NO_FILTERS: FileFilters = { text: "", categories: new Set(ALL_CATEGORIES), onlyNoted: false, hideViewed: false };

/** Comments, open requests and open questions on each path. */
export function noteCounts(state: ReviewState): Map<string, number> {
  const counts = new Map<string, number>();
  const bump = (path: string) => counts.set(path, (counts.get(path) ?? 0) + 1);
  for (const r of state.remote) {
    bump(r.path);
  }
  for (const c of state.comments) {
    if (c.status !== "posted") {
      bump(c.anchor.path);
    }
  }
  for (const r of state.requests) {
    if (r.anchor && r.status !== "done" && r.status !== "declined") {
      bump(r.anchor.path);
    }
  }
  for (const q of state.questions) {
    if (!q.resolved && q.ref) {
      bump(q.ref.path);
    }
  }
  return counts;
}

export function visibleFiles(state: ReviewState, filters: FileFilters, viewed: ReadonlySet<string>, notes: ReadonlyMap<string, number>): PrFile[] {
  const needle = filters.text.trim().toLowerCase();
  const withFindings = new Set(state.review.findings.filter((f) => !f.dismissed).map((f) => f.primary.path));
  return state.files.filter(
    (f) =>
      filters.categories.has(f.category) &&
      (!needle || f.path.toLowerCase().includes(needle) || Boolean(f.previousPath?.toLowerCase().includes(needle))) &&
      (!filters.onlyNoted || Boolean(notes.get(f.path)) || withFindings.has(f.path)) &&
      (!filters.hideViewed || !viewed.has(f.path)),
  );
}

export interface Composer {
  anchor: Anchor;
  /** GitHub id of the comment a reply answers. */
  inReplyTo?: number;
}

/** True when the request's file changed since it was anchored, so its line may point elsewhere now. */
export function anchorMoved(files: readonly PrFile[], r: ChangeRequest): boolean {
  if (!r.anchor || !r.fingerprint) {
    return false;
  }
  return files.find((f) => f.path === r.anchor!.path)?.fingerprint !== r.fingerprint;
}

/** Root comments with their replies, oldest first. */
export function threads(remote: readonly RemoteComment[]): { root: RemoteComment; replies: RemoteComment[] }[] {
  const byId = new Map(remote.map((c) => [c.id, c]));
  const rootOf = (c: RemoteComment): RemoteComment => {
    let current = c;
    for (let hops = 0; current.inReplyTo && byId.has(current.inReplyTo) && hops < 100; hops++) {
      current = byId.get(current.inReplyTo)!;
    }
    return current;
  };
  const groups = new Map<number, { root: RemoteComment; replies: RemoteComment[] }>();
  for (const c of remote) {
    const root = rootOf(c);
    if (!groups.has(root.id)) {
      groups.set(root.id, { root, replies: [] });
    }
    if (c !== root) {
      groups.get(root.id)!.replies.push(c);
    }
  }
  return [...groups.values()];
}

/**
 * Annotations per file path, in the order cards stack on a line: GitHub
 * threads, drafts, the open composer, findings, questions, then requests.
 */
/** reviewLineItems, returning the previous map while no annotation moved. */
export function createLineItemsSelector(): (state: ReviewState, composer: Composer | null) => LineItemMap {
  let previous: LineItemMap | undefined;
  return (state, composer) => (previous = stableLineItems(previous, reviewLineItems(state, composer)));
}

export function reviewLineItems(state: ReviewState, composer: Composer | null): Map<string, DiffLineAnnotation<LineItemRef>[]> {
  const out = new Map<string, DiffLineAnnotation<LineItemRef>[]>();
  const add = (path: string, annotation: DiffLineAnnotation<LineItemRef>) => {
    const list = out.get(path);
    if (list) {
      list.push(annotation);
    } else {
      out.set(path, [annotation]);
    }
  };
  for (const { root } of threads(state.remote)) {
    if (root.line !== null) {
      add(root.path, lineAnnotation(root.side, root.line, "thread", root.id));
    }
  }
  for (const c of state.comments) {
    if (c.status !== "posted" && c.inReplyTo === undefined) {
      add(c.anchor.path, lineAnnotation(c.anchor.side, c.anchor.line, "comment", c.id));
    }
  }
  if (composer && composer.inReplyTo === undefined) {
    add(composer.anchor.path, lineAnnotation(composer.anchor.side, composer.anchor.line, "composer", "composer"));
  }
  for (const f of state.review.findings) {
    if (!f.dismissed) {
      add(f.primary.path, lineAnnotation(sideOf(f.primary.rev), f.primary.endLine, "finding", f.id));
    }
  }
  for (const q of state.questions) {
    if (!q.resolved && q.ref) {
      add(q.ref.path, lineAnnotation(sideOf(q.ref.rev), q.ref.endLine, "question", q.id));
    }
  }
  // A request whose file has changed since may point at the wrong line; it stays in the Requests tab only.
  for (const r of state.requests) {
    if (r.anchor && !anchorMoved(state.files, r)) {
      add(r.anchor.path, lineAnnotation(r.anchor.side, r.anchor.line, "request", r.id));
    }
  }
  return out;
}
