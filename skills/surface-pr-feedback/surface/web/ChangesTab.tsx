// The Changes tab: the working tree against the commit the page opened at,
// so the user sees exactly what the fixes changed, committed or not.
import type { CodeViewItem, FileDiffMetadata } from "@pierre/diffs";
import { CodeView, type CodeViewReactOptions } from "@pierre/diffs/react";
import { useMemo, useState } from "react";
import { createDiffItemsBuilder, type LineItemMap, type LineItemRef } from "../../../../web/kit/diffItems.ts";
import { THEME } from "../../../../web/kit/diffTheme.ts";
import { loadBlob } from "../../../../web/kit/hooks/useBlob.ts";
import { usePatches } from "../../../../web/kit/hooks/usePatches.ts";
import { useStoredState } from "../../../../web/kit/hooks/useStoredState.ts";
import { EmptyState } from "../../../../web/kit/primitives/EmptyState.tsx";
import { Segmented } from "../../../../web/kit/primitives/Segmented.tsx";
import { Spacer } from "../../../../web/kit/primitives/Spacer.tsx";
import { Text } from "../../../../web/kit/primitives/Text.tsx";
import { useRevision } from "../../../../web/kit/store.ts";
import { toast } from "../../../../web/kit/toast.ts";
import { createValueStore, useValue } from "../../../../web/kit/valueStore.ts";
import type { FeedbackState } from "../state.ts";
import { ChangeHeader } from "./ChangeHeader.tsx";
import css from "./ChangesTab.module.css";
import { useFeedback } from "./hooks.ts";
import { changesFilter } from "./nav.ts";

type DiffStyle = "split" | "unified";
const DIFF_STYLES = [
  { id: "split", label: "split" },
  { id: "unified", label: "unified" },
] as const;
const NO_LINE_ITEMS: LineItemMap = new Map();
const collapsedStore = createValueStore<ReadonlySet<string>>(new Set());

const selectFiles = (s: FeedbackState) => s.files;
const selectSince = (s: FeedbackState) => s.target?.since ?? "";
const selectGithub = (s: FeedbackState) => s.pr !== null;
const toastError = (message: string) => toast(message, true);

function renderHeader(item: CodeViewItem<LineItemRef>) {
  return <ChangeHeader path={item.type === "diff" ? item.fileDiff.name : item.file.name} collapsed={collapsedStore} />;
}

/** What sits above the diff when it has nothing to show yet. */
function ChangesStatus({ changed, shown, loaded }: { changed: number; shown: number; loaded: boolean }) {
  if (changed === 0) {
    return <EmptyState small>No changes yet. Fixes the agent makes show here, committed or not.</EmptyState>;
  }
  if (shown === 0) {
    return <EmptyState small>No files match the filter.</EmptyState>;
  }
  return loaded ? null : <Text tone="faint">loading the diff…</Text>;
}

export function ChangesTab() {
  const files = useFeedback(selectFiles);
  const since = useFeedback(selectSince);
  const github = useFeedback(selectGithub);
  const filter = useValue(changesFilter);
  const collapsed = useValue(collapsedStore);
  const [diffStyle, setDiffStyle] = useStoredState<DiffStyle>("feedback:diffStyle", "split");
  const revision = useRevision();
  const patches = usePatches(toastError);
  const shown = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return files.filter((f) => !needle || f.path.toLowerCase().includes(needle) || Boolean(f.previousPath?.toLowerCase().includes(needle)));
  }, [files, filter]);
  const [buildItems] = useState(createDiffItemsBuilder);
  const items = useMemo(() => (patches ? buildItems(shown, patches, NO_LINE_ITEMS, collapsed) : []), [buildItems, shown, patches, collapsed]);
  const options = useMemo<CodeViewReactOptions<LineItemRef, undefined>>(
    () => ({
      theme: THEME,
      themeType: "dark",
      diffStyle,
      hunkSeparators: "line-info",
      lineDiffType: "word",
      overflow: "scroll",
      stickyHeaders: true,
      loadDiffFiles: async (fileDiff: FileDiffMetadata) => {
        const newFile = { name: fileDiff.name, contents: await loadBlob(revision, "work", fileDiff.name) };
        if (fileDiff.type === "rename-pure") {
          return { oldFile: null, newFile };
        }
        const oldName = fileDiff.prevName ?? fileDiff.name;
        return { oldFile: { name: oldName, contents: await loadBlob(revision, "since", oldName) }, newFile };
      },
    }),
    [diffStyle, revision],
  );
  const noText = patches ? shown.filter((f) => !patches.has(f.path)) : [];
  return (
    <div className={css.column}>
      <div className={css.toolbar}>
        <span>
          {files.length} file{files.length === 1 ? "" : "s"} changed since {since.slice(0, 8)}
          {github ? " (the PR head when you opened the page)" : ""}
        </span>
        <input className={css.search} placeholder="Filter files…" value={filter} onChange={(e) => changesFilter.set(e.target.value)} />
        <Spacer />
        <Segmented options={DIFF_STYLES} value={diffStyle} onChange={setDiffStyle} />
      </div>
      {noText.length ? <div className={css.binary}>No text diff (binary or mode change): {noText.map((f) => f.path).join(", ")}</div> : null}
      <ChangesStatus changed={files.length} shown={shown.length} loaded={patches !== undefined} />
      <CodeView className={css.viewer} items={items} options={options} renderCustomHeader={renderHeader} />
    </div>
  );
}
