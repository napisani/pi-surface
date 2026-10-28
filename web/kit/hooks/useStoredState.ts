import { useCallback, useSyncExternalStore } from "react";

// Bump when a stored value's shape changes, so old values are ignored rather than misread.
const PREFIX = "surface:v1:";
const values = new Map<string, unknown>();
const listeners = new Map<string, Set<() => void>>();

function read<T>(key: string, fallback: T): T {
  if (!values.has(key)) {
    let value: unknown = fallback;
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (raw !== null) {
        value = JSON.parse(raw);
      }
    } catch {
      value = fallback;
    }
    values.set(key, value);
  }
  // SAFETY: a key is always read with the type of its one fallback, and only values of that type are stored under it.
  return values.get(key) as T;
}

/** A value kept in localStorage and shared by every component reading the same key. */
export function useStoredState<T>(key: string, fallback: T): [T, (value: T) => void] {
  const subscribe = useCallback(
    (listener: () => void) => {
      const set = listeners.get(key) ?? new Set();
      set.add(listener);
      listeners.set(key, set);
      return () => set.delete(listener);
    },
    [key],
  );
  const get = useCallback(() => read(key, fallback), [key, fallback]);
  const value = useSyncExternalStore(subscribe, get, get);
  const setValue = useCallback(
    (next: T) => {
      values.set(key, next);
      try {
        localStorage.setItem(PREFIX + key, JSON.stringify(next));
      } catch {
        // Private windows can refuse storage; the value still lives for this page.
      }
      for (const listener of [...(listeners.get(key) ?? [])]) {
        listener();
      }
    },
    [key],
  );
  return [value, setValue];
}
