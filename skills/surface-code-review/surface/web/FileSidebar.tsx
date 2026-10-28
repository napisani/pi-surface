import type { Category, PrFile } from "../../../../src/kit/git.ts";
import { CategoryDot } from "../../../../web/kit/CategoryDot.tsx";
import { CATEGORY_LABEL } from "../../../../web/kit/CategoryTag.tsx";
import { cx } from "../../../../web/kit/cx.ts";
import { FileTree } from "../../../../web/kit/FileTree.tsx";
import { Badge } from "../../../../web/kit/primitives/Badge.tsx";
import { Checkbox } from "../../../../web/kit/primitives/Checkbox.tsx";
import type { Finding } from "../../../../src/kit/findings.ts";
import { useValue } from "../../../../web/kit/valueStore.ts";
import css from "./FileSidebar.module.css";
import { ALL_CATEGORIES } from "./lineItems.ts";
import { filterStore } from "./ui.ts";

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
  const count = (c: Category) => files.filter((f) => f.category === c).length;
  const toggle = (c: Category) =>
    filterStore.update((f) => {
      const categories = new Set(f.categories);
      if (categories.has(c)) {
        categories.delete(c);
      } else {
        categories.add(c);
      }
      return { ...f, categories };
    });
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
    <aside className={css.sidebar}>
      <input className={css.search} placeholder="Filter files…" value={filters.text} onChange={(e) => filterStore.update((f) => ({ ...f, text: e.target.value }))} />
      <div className={css.cats}>
        {ALL_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            className={cx(css.cat, filters.categories.has(c) && css.on)}
            title="Click to toggle, double-click for only this"
            onClick={() => toggle(c)}
            onDoubleClick={() => filterStore.update((f) => ({ ...f, categories: new Set([c]) }))}
          >
            <CategoryDot category={c} />
            {CATEGORY_LABEL[c]}
            <span className={css.n}>{count(c)}</span>
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
      <FileTree files={shown} viewed={viewed} renderBadges={renderBadges} onOpen={onOpen} />
    </aside>
  );
}
