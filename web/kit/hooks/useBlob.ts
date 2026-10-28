import { useEffect, useState } from "react";
import type { Rev } from "../../../src/kit/code.ts";
import { useRevision } from "../store.ts";
import { fetchText } from "./fetchText.ts";

let cacheRevision = "";
const cache = new Map<string, Promise<string>>();

/** A file's text at one revision from the blob route, fetched once per page revision. */
export function loadBlob(revision: string, rev: Rev, path: string): Promise<string> {
  if (revision !== cacheRevision) {
    cacheRevision = revision;
    cache.clear();
  }
  const key = `${rev}:${path}`;
  let text = cache.get(key);
  if (!text) {
    text = fetchText(`r/blob?${new URLSearchParams({ rev, path })}`);
    text.catch(() => cache.delete(key));
    cache.set(key, text);
  }
  return text;
}

export interface BlobState {
  text?: string;
  error?: string;
}

export function useBlob(rev: Rev, path: string): BlobState {
  const revision = useRevision();
  const key = `${revision}:${rev}:${path}`;
  const [state, setState] = useState<BlobState & { key?: string }>({});
  useEffect(() => {
    let current = true;
    loadBlob(revision, rev, path).then(
      (text) => current && setState({ key, text }),
      (error: Error) => current && setState({ key, error: error.message }),
    );
    return () => {
      current = false;
    };
  }, [key, revision, rev, path]);
  return state.key === key ? state : {};
}
