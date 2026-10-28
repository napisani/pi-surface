// The code a finding, analysis or tour step points at. When the page's diff has
// the ref's lines inside a hunk, it shows that diff; otherwise the file at the ref's revision.
import type { FileDiffMetadata, SelectedLineRange } from "@pierre/diffs";
import { File, FileDiff } from "@pierre/diffs/react";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import type { CodeRef as CodeRefValue, Rev } from "../../src/kit/code.ts";
import { cx } from "./cx.ts";
import css from "./CodeRef.module.css";
import { THEME } from "./diffTheme.ts";
import { useBlob } from "./hooks/useBlob.ts";
import { usePatches } from "./hooks/usePatches.ts";
import { lines } from "./lines.ts";
import { Button } from "./primitives/Button.tsx";

const FILE_OPTIONS = { theme: THEME, themeType: "dark", disableFileHeader: true, overflow: "wrap" } as const;
const DIFF_OPTIONS = { ...FILE_OPTIONS, diffStyle: "unified" } as const;

/** True when the ref's lines overlap a hunk on its side, so the diff shows them. */
function inHunk(fileDiff: FileDiffMetadata | undefined, ref: CodeRefValue): boolean {
  const right = ref.rev !== "base";
  return Boolean(
    fileDiff?.hunks.some((h) => {
      const start = right ? h.additionStart : h.deletionStart;
      const count = right ? h.additionCount : h.deletionCount;
      return ref.startLine <= start + count - 1 && ref.endLine >= start;
    }),
  );
}

/** Scrolls the scroller, not the page, so the selected lines sit near the top once pierre has drawn them. */
function useScrollToSelection(scroller: RefObject<HTMLDivElement | null>, key: string) {
  useEffect(() => {
    let attempts = 20;
    let timer: ReturnType<typeof setTimeout>;
    const find = () => {
      const host = scroller.current;
      const line = host?.querySelector("diffs-container")?.shadowRoot?.querySelector<HTMLElement>("[data-selected-line]");
      if (host && line) {
        host.scrollTop += line.getBoundingClientRect().top - host.getBoundingClientRect().top - 48;
      } else if (attempts-- > 0) {
        timer = setTimeout(find, 50);
      }
    };
    find();
    return () => clearTimeout(timer);
  }, [scroller, key]);
}

function DiffAtRef({ fileDiff, codeRef, scroller }: { fileDiff: FileDiffMetadata; codeRef: CodeRefValue; scroller: RefObject<HTMLDivElement | null> }) {
  const selected = useMemo<SelectedLineRange>(
    () => ({ start: codeRef.startLine, end: codeRef.endLine, side: codeRef.rev === "base" ? "deletions" : "additions" }),
    [codeRef.startLine, codeRef.endLine, codeRef.rev],
  );
  useScrollToSelection(scroller, `${codeRef.path}:${codeRef.startLine}`);
  return <FileDiff fileDiff={fileDiff} options={DIFF_OPTIONS} selectedLines={selected} />;
}

function FileAtRef({ codeRef, scroller }: { codeRef: CodeRefValue; scroller: RefObject<HTMLDivElement | null> }) {
  const blob = useBlob(codeRef.rev, codeRef.path);
  const file = useMemo(
    () => (blob.text === undefined ? undefined : { name: codeRef.path, contents: blob.text, cacheKey: `${codeRef.rev}:${codeRef.path}:${blob.text.length}` }),
    [blob.text, codeRef.path, codeRef.rev],
  );
  const selected = useMemo<SelectedLineRange>(() => ({ start: codeRef.startLine, end: codeRef.endLine }), [codeRef.startLine, codeRef.endLine]);
  useScrollToSelection(scroller, `${file?.cacheKey}:${codeRef.startLine}`);
  if (blob.error) {
    return <div className={css.error}>{blob.error}</div>;
  }
  if (!file) {
    return <div className={css.status}>loading {codeRef.path}…</div>;
  }
  return <File file={file} options={FILE_OPTIONS} selectedLines={selected} />;
}

function CodeAtRef({ codeRef, diffRev, scroller }: { codeRef: CodeRefValue; diffRev?: Rev; scroller: RefObject<HTMLDivElement | null> }) {
  const diffable = diffRev !== undefined && (codeRef.rev === "base" || codeRef.rev === diffRev);
  const patches = usePatches();
  const fileDiff = diffable ? patches?.get(codeRef.path) : undefined;
  if (diffable && !patches) {
    return <div className={css.status}>loading {codeRef.path}…</div>;
  }
  return fileDiff && inHunk(fileDiff, codeRef) ? <DiffAtRef fileDiff={fileDiff} codeRef={codeRef} scroller={scroller} /> : <FileAtRef codeRef={codeRef} scroller={scroller} />;
}

export interface CodeRefProps {
  codeRef: CodeRefValue;
  role?: string;
  /** Shown at the end of the header, e.g. the revision's name. */
  label?: string;
  /** Marks a file outside the diff. */
  outside?: boolean;
  /** Opens the lines in the page's diff; omitted when the file is not in it. */
  onOpen?: () => void;
  /** The revision the page diff's new side shows; unset when there is no diff to show refs in. */
  diffRev?: Rev;
  tall?: boolean;
}

/** A labelled code block: role, place, an optional note, then the code. */
export function CodeRef({ codeRef, role, label, outside, onOpen, diffRev, tall }: CodeRefProps) {
  const scroller = useRef<HTMLDivElement>(null);
  return (
    <div className={css.coderef}>
      <div className={css.head}>
        {role ? <span className={css.role}>{role}</span> : null}
        <span className={css.path}>
          {codeRef.path}:{lines(codeRef.startLine, codeRef.endLine)}
        </span>
        {outside ? <span className={css.label}>not in this diff</span> : null}
        <span className={css.spacer} />
        {label ? <span className={css.label}>{label}</span> : null}
        {onOpen ? (
          <Button size="small" onClick={onOpen}>
            Open in diff
          </Button>
        ) : null}
      </div>
      {codeRef.note ? <div className={css.note}>{codeRef.note}</div> : null}
      <div ref={scroller} className={cx(css.scroll, tall && css.tall)}>
        <CodeAtRef codeRef={codeRef} diffRev={diffRev} scroller={scroller} />
      </div>
    </div>
  );
}
