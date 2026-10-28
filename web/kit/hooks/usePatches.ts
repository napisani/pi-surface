import { parsePatchFiles, type FileDiffMetadata } from "@pierre/diffs";
import { useEffect, useState } from "react";
import { useRevision } from "../store.ts";
import { fetchText } from "./fetchText.ts";

let cached: { revision: string; patches: Promise<Map<string, FileDiffMetadata>> } | undefined;

function loadPatches(revision: string): Promise<Map<string, FileDiffMetadata>> {
  if (cached?.revision !== revision) {
    const patches = fetchText("r/diff").then((text) => {
      const map = new Map<string, FileDiffMetadata>();
      // pierre caches highlighting by key, so each revision needs its own prefix.
      for (const patch of parsePatchFiles(text, `rev-${revision}`)) {
        for (const file of patch.files) {
          map.set(file.name, file);
        }
      }
      return map;
    });
    patches.catch(() => (cached = undefined));
    cached = { revision, patches };
  }
  return cached.patches;
}

/**
 * The page's diff parsed into per-file metadata, once per revision. pierre
 * hydrates these objects in place, so the same revision always yields the same objects.
 */
export function usePatches(onError?: (message: string) => void): ReadonlyMap<string, FileDiffMetadata> | undefined {
  const revision = useRevision();
  const [loaded, setLoaded] = useState<{ revision: string; patches: Map<string, FileDiffMetadata> }>();
  useEffect(() => {
    let current = true;
    loadPatches(revision).then(
      (patches) => current && setLoaded({ revision, patches }),
      (error: Error) => current && onError?.(`Could not load the diff: ${error.message}`),
    );
    return () => {
      current = false;
    };
  }, [revision, onError]);
  return loaded?.revision === revision ? loaded.patches : undefined;
}
