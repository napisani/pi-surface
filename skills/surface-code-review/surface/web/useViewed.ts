import { useCallback, useMemo } from "react";
import { useStoredState } from "../../../../web/kit/hooks/useStoredState.ts";
import type { ReviewState } from "../state.ts";
import { useReview } from "./hooks.ts";

const NONE: Readonly<Record<string, string>> = {};
const selectFiles = (s: ReviewState) => s.files;
const selectKey = (s: ReviewState) => (s.target ? `review:viewed:${s.target.worktree}:${s.pr?.url ?? s.target.baseRef}` : "review:viewed");

/** Files marked viewed. Each is kept with its fingerprint, so a file that changes is unviewed again. */
export function useViewed(): [ReadonlySet<string>, (path: string, viewed: boolean) => void] {
  const files = useReview(selectFiles);
  const [kept, setKept] = useStoredState(useReview(selectKey), NONE);
  const viewed = useMemo(() => new Set(files.filter((f) => kept[f.path] === f.fingerprint).map((f) => f.path)), [files, kept]);
  const setViewed = useCallback(
    (path: string, on: boolean) => {
      const next = Object.fromEntries(files.filter((f) => (f.path === path ? on : viewed.has(f.path))).map((f) => [f.path, f.fingerprint]));
      setKept(next);
    },
    [files, viewed, setKept],
  );
  return [viewed, setViewed];
}
