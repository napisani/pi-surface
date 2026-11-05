import { useRef } from "react";
import { useCommands } from "../../../../web/kit/keyboardContext.ts";
import type { Category, PrFile } from "../../../../src/kit/git.ts";
import { CategoryDot } from "../../../../web/kit/CategoryDot.tsx";
import { CATEGORY_LABEL } from "../../../../web/kit/CategoryTag.tsx";
import { cx } from "../../../../web/kit/cx.ts";
import { FileTree } from "../../../../web/kit/FileTree.tsx";
import { Badge } from "../../../../web/kit/primitives/Badge.tsx";
import { Checkbox } from "../../../../web/kit/primitives/Checkbox.tsx";
import { StatusLetter } from "../../../../web/kit/StatusLetter.tsx";
import type { Finding } from "../../../../src/kit/findings.ts";
import { useValue } from "../../../../web/kit/valueStore.ts";
import css from "./FileSidebar.module.css";
import { ALL_CATEGORIES, ALL_CHANGES, changeOf, type ChangeKind, type FileFilters } from "./lineItems.ts";
import { filterStore } from "./ui.ts";

const CHANGE_LABEL = { modified: "Modified", added: "Added", deleted: "Deleted" } satisfies Record<ChangeKind, string>;

/** A filter group with one value toggled, or with only that value when it is the only one asked for. */
function toggled<T>(set: ReadonlySet<T>, value: T, only: boolean): Set<T> {
  if (only) {
    return new Set([value]);
  }
  const next = new Set(set);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
}

const setCategory = (c: Category, only = false) => filterStore.update((f): FileFilters => ({ ...f, categories: toggled(f.categories, c, only) }));
const setChange = (k: ChangeKind, only = false) => filterStore.update((f): FileFilters => ({ ...f, changes: toggled(f.changes, k, only) }));

export interface FileSidebarProps {
  files: readonly PrFile[];
  shown: readonly PrFile[];
  viewed: ReadonlySet<string>;
  notes: ReadonlyMap<string, number>;
  findings: readonly Finding[];
  onOpen(file: PrFile): void;
}

/** Filters for the changed files, and the tree of the ones that pass. */
export function FileSidebar({ files, shown, viewed, notes, findings, onOpen }: FileSidebarProps) {
  const filters = useValue(filterStore);
  const input = useRef<HTMLInputElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  useCommands([{ id: "review.tree", label: "Focus base-change file tree", keys: ["<leader>cT"], run: () => sidebar.current?.querySelector<HTMLElement>("[data-keyboard-pane]")?.focus() }]);
  const count = (c: Category) => files.filter((f) => f.category === c).length;
  const countChange = (k: ChangeKind) => files.filter((f) => changeOf(f) === k).length;
  const renderBadges = (f: PrFile) => {
    const own = findings.filter((x) => !x.dismissed && x.primary.path === f.path);
    const n = notes.get(f.path) ?? 0;
    return (
      <>
        {own.length ? (
          <Badge mini severity={own[0].severity}>
            {own.length}F
          </Badge>
        ) : null}
        {n ? <Badge mini>💬{n}</Badge> : null}
      </>
    );
  };
  return (
    <aside ref={sidebar} className={css.sidebar}>
      <input ref={input} className={css.search} placeholder="Filter files…" value={filters.text} onChange={(e) => filterStore.update((f) => ({ ...f, text: e.target.value }))} />
      {filters.token ? (
        <div className={css.token}>
          <span>
            Changes with <code>{filters.token}</code>
          </span>
          <button type="button" aria-label="Clear the token filter" onClick={() => filterStore.update((f) => ({ ...f, token: "" }))}>
            ×
          </button>
        </div>
      ) : null}
      <div className={css.cats}>
        {ALL_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            className={cx(css.cat, filters.categories.has(c) && css.on)}
            title="Click to toggle, double-click for only this"
            onClick={() => setCategory(c)}
            onDoubleClick={() => setCategory(c, true)}
          >
            <CategoryDot category={c} />
            {CATEGORY_LABEL[c]}
            <span className={css.n}>{count(c)}</span>
          </button>
        ))}
      </div>
      <div className={css.changes} title="Shown files match a kind of file and a kind of change">
        {ALL_CHANGES.map((k) => (
          <button
            key={k}
            type="button"
            className={cx(css.cat, filters.changes.has(k) && css.on)}
            title="Click to toggle, double-click for only this"
            onClick={() => setChange(k)}
            onDoubleClick={() => setChange(k, true)}
          >
            <StatusLetter status={k} />
            {CHANGE_LABEL[k]}
            <span className={css.n}>{countChange(k)}</span>
          </button>
        ))}
      </div>
      <div className={css.toggles}>
        <Checkbox checked={filters.onlyNoted} onChange={(onlyNoted) => filterStore.update((f) => ({ ...f, onlyNoted }))}>
          With notes or findings
        </Checkbox>
        <Checkbox checked={filters.hideViewed} onChange={(hideViewed) => filterStore.update((f) => ({ ...f, hideViewed }))}>
          Hide viewed
        </Checkbox>
      </div>
      <div className={css.meta}>
        {shown.length} of {files.length} files · {viewed.size} viewed
      </div>
      <FileTree files={shown} viewed={viewed} renderBadges={renderBadges} onOpen={onOpen} onFilter={() => input.current?.focus()} onClearFilter={() => filterStore.update((current) => ({ ...current, text: "" }))} />
    </aside>
  );
}
