// The Files tab: a filterable file tree beside one virtualized view of every
// changed file's diff, with drafts, threads, findings, questions and requests on its lines.
import type { CodeViewItem, FileDiffMetadata, SelectedLineRange } from "@pierre/diffs";
import { CodeView, type CodeViewHandle, type CodeViewReactOptions } from "@pierre/diffs/react";
import { useMemo, useState, type RefObject } from "react";
import type { Anchor } from "../../../../src/kit/code.ts";
import { createDiffItemsBuilder, type LineItemRef } from "../../../../web/kit/diffItems.ts";
import { THEME } from "../../../../web/kit/diffTheme.ts";
import { loadBlob } from "../../../../web/kit/hooks/useBlob.ts";
import { usePatches } from "../../../../web/kit/hooks/usePatches.ts";
import { useStoredState } from "../../../../web/kit/hooks/useStoredState.ts";
import { Button } from "../../../../web/kit/primitives/Button.tsx";
import { Delta } from "../../../../web/kit/primitives/Delta.tsx";
import { EmptyState } from "../../../../web/kit/primitives/EmptyState.tsx";
import { Segmented } from "../../../../web/kit/primitives/Segmented.tsx";
import { Spacer } from "../../../../web/kit/primitives/Spacer.tsx";
import { Text } from "../../../../web/kit/primitives/Text.tsx";
import { useRevision } from "../../../../web/kit/store.ts";
import { toast } from "../../../../web/kit/toast.ts";
import { useValue } from "../../../../web/kit/valueStore.ts";
import type { ReviewState } from "../state.ts";
import { FileHeader } from "./FileHeader.tsx";
import { FileSidebar } from "./FileSidebar.tsx";
import css from "./FilesTab.module.css";
import { useReview } from "./hooks.ts";
import { createLineItemsSelector, noteCounts, sideRev, visibleFiles } from "./lineItems.ts";
import { renderLineItem } from "./LineItem.tsx";
import { useNav } from "./nav.ts";
import { collapsedStore, composerStore, filterStore } from "./ui.ts";
import { useViewed } from "./useViewed.ts";

type DiffStyle = "split" | "unified";
const DIFF_STYLES = [
  { id: "split", label: "split" },
  { id: "unified", label: "unified" },
] as const;

const selectState = (s: ReviewState) => s;
const toastError = (message: string) => toast(message, true);

function renderHeader(item: CodeViewItem<LineItemRef>) {
  return <FileHeader path={item.type === "diff" ? item.fileDiff.name : item.file.name} />;
}

function onGutter(range: SelectedLineRange, context: { item: CodeViewItem<LineItemRef> }) {
  if (context.item.type !== "diff") {
    return;
  }
  const [start, end] = [Math.min(range.start, range.end), Math.max(range.start, range.end)];
  const side = (range.endSide ?? range.side) === "deletions" ? "LEFT" : "RIGHT";
  const anchor: Anchor = { path: context.item.fileDiff.name, side, line: end };
  if (start < end) {
    anchor.startLine = start;
  }
  composerStore.set({ anchor });
}

export function FilesTab({ viewer }: { viewer: RefObject<CodeViewHandle<LineItemRef, undefined> | null> }) {
  const nav = useNav();
  const state = useReview(selectState);
  const filters = useValue(filterStore);
  const collapsed = useValue(collapsedStore);
  const composer = useValue(composerStore);
  const [viewed] = useViewed();
  const [diffStyle, setDiffStyle] = useStoredState<DiffStyle>("review:diffStyle", "split");
  const revision = useRevision();
  const patches = usePatches(toastError);
  const mode = state.target?.mode ?? "pinned";

  const notes = useMemo(() => noteCounts(state), [state]);
  const shown = useMemo(() => visibleFiles(state, filters, viewed, notes), [state, filters, viewed, notes]);
  const [selectLineItems] = useState(createLineItemsSelector);
  const lineItems = useMemo(() => selectLineItems(state, composer), [selectLineItems, state, composer]);
  const closed = useMemo(() => new Set([...collapsed, ...viewed]), [collapsed, viewed]);
  const [buildItems] = useState(createDiffItemsBuilder);
  const items = useMemo(() => (patches ? buildItems(shown, patches, lineItems, closed) : []), [buildItems, shown, patches, lineItems, closed]);

  const options = useMemo<CodeViewReactOptions<LineItemRef, undefined>>(() => {
    const newRev = sideRev(mode, "RIGHT");
    return {
      theme: THEME,
      themeType: "dark",
      diffStyle,
      hunkSeparators: "line-info",
      lineDiffType: "word",
      overflow: "scroll",
      stickyHeaders: true,
      lineHoverHighlight: "both",
      enableLineSelection: true,
      enableGutterUtility: true,
      onGutterUtilityClick: onGutter,
      loadDiffFiles: async (fileDiff: FileDiffMetadata) => {
        const newFile = { name: fileDiff.name, contents: await loadBlob(revision, newRev, fileDiff.name) };
        if (fileDiff.type === "rename-pure") {
          return { oldFile: null, newFile };
        }
        const oldName = fileDiff.prevName ?? fileDiff.name;
        return { oldFile: { name: oldName, contents: await loadBlob(revision, "base", oldName) }, newFile };
      },
    };
  }, [diffStyle, revision, mode]);

  const noText = patches ? shown.filter((f) => !patches.has(f.path)) : [];
  const adds = state.files.reduce((n, f) => n + f.additions, 0);
  const dels = state.files.reduce((n, f) => n + f.deletions, 0);
  const hint = `Click + beside a line to ${mode === "live" ? "request a change, " : ""}${state.pr ? "comment, " : ""}or ask the agent. Drag across line numbers to pick several lines.`;
  return (
    <div className={css.layout}>
      <FileSidebar files={state.files} shown={shown} viewed={viewed} notes={notes} findings={state.review.findings} onOpen={(f) => nav.jumpTo({ path: f.path, side: "RIGHT", line: 1 })} />
      <div className={css.column}>
        <div className={css.toolbar}>
          <span>
            {state.files.length} files · <Delta additions={adds} deletions={dels} />
          </span>
          <Spacer />
          <Text tone="faint">{hint}</Text>
          <Segmented options={DIFF_STYLES} value={diffStyle} onChange={setDiffStyle} />
          <Button onClick={() => collapsedStore.set(new Set(shown.map((f) => f.path)))}>Collapse all</Button>
          <Button onClick={() => collapsedStore.set(new Set())}>Expand all</Button>
        </div>
        {noText.length ? <div className={css.binary}>No text diff (binary or mode change): {noText.map((f) => f.path).join(", ")}</div> : null}
        {!patches ? <Text tone="faint">loading the diff…</Text> : null}
        {patches && !shown.length ? <EmptyState>No files match the filters.</EmptyState> : null}
        <CodeView ref={viewer} className={css.viewer} items={items} options={options} renderCustomHeader={renderHeader} renderAnnotation={renderLineItem} />
      </div>
    </div>
  );
}
