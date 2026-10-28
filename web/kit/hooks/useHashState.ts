import { useCallback, useSyncExternalStore } from "react";

// One hashchange listener for the whole page, however many components read the hash.
const listeners = new Set<() => void>();
const notify = () => {
  for (const listener of [...listeners]) {
    listener();
  }
};
function subscribe(listener: () => void) {
  if (listeners.size === 0) {
    window.addEventListener("hashchange", notify);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener("hashchange", notify);
    }
  };
}
const readHash = () => window.location.hash;

/** Sets several hash keys at once, as one history entry. */
export function setHashValues(values: Record<string, string | undefined>) {
  const params = new URLSearchParams(window.location.hash.slice(1));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
  }
  const next = `#${params}`;
  if (next === window.location.hash) {
    return;
  }
  window.location.hash = next;
  notify();
}

function useHashParam(key: string): string | null {
  const hash = useSyncExternalStore(subscribe, readHash, readHash);
  return new URLSearchParams(hash.slice(1)).get(key);
}

/**
 * Navigation state kept in the URL hash, so a reload or a reopened page lands
 * in the same place: a selected item, a step.
 */
export function useHashState(key: string, fallback: string): [string, (value: string) => void] {
  const value = useHashParam(key) ?? fallback;
  const set = useCallback((next: string) => setHashValues({ [key]: next }), [key]);
  return [value, set];
}

/** Like useHashState for one of a fixed set of values, e.g. a tab; anything else reads as the fallback. */
export function useHashChoice<T extends string>(key: string, fallback: T, allowed: readonly T[]): [T, (value: T) => void] {
  const raw = useHashParam(key);
  const value = allowed.find((choice) => choice === raw) ?? fallback;
  const set = useCallback((next: T) => setHashValues({ [key]: next }), [key]);
  return [value, set];
}
