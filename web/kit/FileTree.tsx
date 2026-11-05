// The changed files as a tree, with single-child directories folded together.
import { useMemo, useRef, useState, type ReactNode } from "react";
import type { PrFile } from "../../src/kit/git.ts";
import { CategoryDot } from "./CategoryDot.tsx";
import { cx } from "./cx.ts";
import css from "./FileTree.module.css";
import { useKeyboardPane } from "./hooks/useKeyboardPane.ts";
import { useCommands } from "./keyboardContext.ts";
import { Delta } from "./primitives/Delta.tsx";
import { StatusLetter } from "./StatusLetter.tsx";

interface TreeNode {
  name: string;
  path: string;
  dirs: TreeNode[];
  files: PrFile[];
}

function buildTree(files: readonly PrFile[]): TreeNode {
  type Building = { name: string; path: string; dirs: Map<string, Building>; files: PrFile[] };
  const root: Building = { name: "", path: "", dirs: new Map(), files: [] };
  for (const file of files) {
    let node = root;
    for (const part of file.path.split("/").slice(0, -1)) {
      let next = node.dirs.get(part);
      if (!next) {
        next = { name: part, path: node.path ? `${node.path}/${part}` : part, dirs: new Map(), files: [] };
        node.dirs.set(part, next);
      }
      node = next;
    }
    node.files.push(file);
  }
  const finish = (node: Building): TreeNode => {
    const dirs = [...node.dirs.values()].map(finish).toSorted((a, b) => a.name.localeCompare(b.name));
    if (node.name && node.files.length === 0 && dirs.length === 1) {
      return { ...dirs[0], name: `${node.name}/${dirs[0].name}` };
    }
    return { name: node.name, path: node.path, dirs, files: node.files.toSorted((a, b) => a.path.localeCompare(b.path)) };
  };
  return finish(root);
}

export interface FileTreeProps {
  files: readonly PrFile[];
  viewed: ReadonlySet<string>;
  /** Small badges after a file's name: findings, comment counts. */
  renderBadges?: (file: PrFile) => ReactNode;
  onOpen(file: PrFile): void;
  onFilter?(): void;
  onClearFilter?(): void;
}

const depthClass = (depth: number) => css[`depth${Math.min(depth, 5)}`];

function Node({ node, depth, closed, toggle, props }: { node: TreeNode; depth: number; closed: ReadonlySet<string>; toggle(path: string): void; props: FileTreeProps }) {
  return (
    <>
      {node.dirs.map((dir) => (
        <div key={dir.path}>
          <button type="button" data-tree-path={dir.path} data-tree-parent={node.path} className={cx(css.dir, depthClass(depth))} onClick={() => toggle(dir.path)}>
            <span className={css.caret}>{closed.has(dir.path) ? "▸" : "▾"}</span>
            {dir.name}
          </button>
          {closed.has(dir.path) ? null : <Node node={dir} depth={depth + 1} closed={closed} toggle={toggle} props={props} />}
        </div>
      ))}
      {node.files.map((f) => (
        <button key={f.path} type="button" data-tree-path={f.path} data-tree-parent={node.path} className={cx(css.file, depthClass(depth), props.viewed.has(f.path) && css.viewed)} title={f.path} onClick={() => props.onOpen(f)}>
          <StatusLetter status={f.status} />
          <CategoryDot category={f.category} />
          <span className={css.name}>{f.path.split("/").pop()}</span>
          {props.renderBadges?.(f)}
          <span className={css.delta}>
            <Delta additions={f.additions} deletions={f.deletions} small />
          </span>
        </button>
      ))}
    </>
  );
}

export function FileTree(props: FileTreeProps) {
  const tree = useMemo(() => buildTree(props.files), [props.files]);
  const element = useRef<HTMLDivElement>(null);
  const active = useKeyboardPane(element, "File tree");
  const [closed, setClosed] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = (path: string) =>
    setClosed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  const buttons = () => [...(element.current?.querySelectorAll<HTMLButtonElement>("button[data-tree-path]") ?? [])];
  const current = () => buttons().find((button) => button === document.activeElement) ?? buttons()[0];
  const move = (delta: number) => {
    const rows = buttons();
    const at = rows.findIndex((button) => button === document.activeElement);
    rows[Math.max(0, Math.min(rows.length - 1, at < 0 ? 0 : at + delta))]?.focus();
  };
  const open = () => {
    const button = current();
    const path = button?.dataset.treePath;
    const file = props.files.find((entry) => entry.path === path);
    button?.focus();
    if (file) { props.onOpen(file); } else if (path) { if (closed.has(path)) { toggle(path); } else { move(1); } }
  };
  const parent = () => {
    const button = current();
    const path = button?.dataset.treePath;
    if (path && !props.files.some((file) => file.path === path) && !closed.has(path)) {
      toggle(path);
    } else {
      buttons().find((row) => row.dataset.treePath === button?.dataset.treeParent)?.focus();
    }
  };
  useCommands([
    { id: "tree.next", label: "Next tree row", keys: ["j"], run: () => move(1) },
    { id: "tree.previous", label: "Previous tree row", keys: ["k"], run: () => move(-1) },
    { id: "tree.open", label: "Open file / expand directory", keys: ["l", "o", "<Enter>"], run: open },
    { id: "tree.parent", label: "Close directory / go up", keys: ["h", "<Backspace>"], run: parent },
    { id: "tree.filter", label: "Filter file tree", keys: ["f"], disabled: props.onFilter ? undefined : "No filter", run: () => props.onFilter?.() },
    { id: "tree.clearFilter", label: "Clear tree filter", keys: ["F"], disabled: props.onClearFilter ? undefined : "No filter", run: () => props.onClearFilter?.() },
  ], active, 1);
  return (
    <div className={css.tree} ref={element}>
      <Node node={tree} depth={0} closed={closed} toggle={toggle} props={props} />
    </div>
  );
}
