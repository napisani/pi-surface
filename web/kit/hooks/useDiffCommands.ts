import type { FileDiffMetadata } from "@pierre/diffs";
import type { CodeViewHandle } from "@pierre/diffs/react";
import { useMemo, type RefObject } from "react";
import type { PrFile } from "../../../src/kit/git.ts";
import { diffItemId } from "../diffItems.ts";
import { hunkStops, nextHunk } from "../diffNavigation.ts";
import { useCommands, useKeyboard } from "../keyboardContext.ts";
import type { JumpTarget } from "./useJumpTo.ts";

export function useDiffCommands<A>({ id, files, patches, viewer, open, cycleLayout, pickerKey }: {
  id: string;
  files: readonly PrFile[];
  patches: ReadonlyMap<string, FileDiffMetadata> | undefined;
  viewer: RefObject<CodeViewHandle<A, undefined> | null>;
  open(target: JumpTarget): void;
  cycleLayout(): void;
  pickerKey: string;
}) {
  const keyboard = useKeyboard();
  const paths = useMemo(() => files.map((file) => file.path), [files]);
  const stops = useMemo(() => patches ? hunkStops(paths, patches) : [], [paths, patches]);
  const selection = (): JumpTarget | undefined => {
    const selected = viewer.current?.getSelectedLines();
    if (!selected) {
      return undefined;
    }
    const path = paths.find((candidate) => diffItemId(candidate) === selected.id);
    if (!path) {
      return undefined;
    }
    const range = selected.range;
    if (range.endSide && range.side && range.endSide !== range.side) {
      throw new Error("Select lines on one side of the diff before asking about them");
    }
    return { path, side: range.side === "deletions" ? "LEFT" : "RIGHT", line: Math.max(range.start, range.end), startLine: Math.min(range.start, range.end) };
  };
  const hunk = (delta: 1 | -1) => {
    const next = nextHunk(stops, paths, selection(), delta);
    if (next) { open(next); }
  };
  const file = (delta: 1 | -1) => {
    const current = selection();
    const index = current ? paths.indexOf(current.path) : -1;
    const path = paths[Math.max(0, Math.min(paths.length - 1, index < 0 ? 0 : index + delta))];
    if (path) { open(stops.find((stop) => stop.path === path) ?? { path, side: "RIGHT", line: 1 }); }
  };
  useCommands([
    { id: `${id}.next`, label: "Next changed hunk", keys: ["]g", "]c"], disabled: stops.length ? undefined : "No text hunks", run: () => hunk(1) },
    { id: `${id}.previous`, label: "Previous changed hunk", keys: ["[g", "[c"], disabled: stops.length ? undefined : "No text hunks", run: () => hunk(-1) },
    { id: `${id}.nextFile`, label: "Next file", keys: ["]f"], run: () => file(1) },
    { id: `${id}.previousFile`, label: "Previous file", keys: ["[f"], run: () => file(-1) },
    { id: `${id}.layout`, label: "Cycle unified / split diff", keys: ["<leader>cw"], run: cycleLayout },
    { id: `${id}.files`, label: "Find a file in this diff", keys: [pickerKey], run: () => keyboard?.pick("Files in this diff", files.map((entry) => ({ id: entry.path, label: entry.path, run: () => open(stops.find((stop) => stop.path === entry.path) ?? { path: entry.path, side: "RIGHT", line: 1 }) }))) },
  ]);
  return { selection, first: stops[0] };
}
