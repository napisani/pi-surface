// The page's copy of the workflow's state document, and how components reach
// it. The store changes only by applying the server's snapshots and deltas;
// components subscribe to the slice they render through useSelect.
import { createContext, createElement, useCallback, useContext, useState, useSyncExternalStore, type ReactNode } from "react";
import { applyPatchImmutable, type PatchOp } from "../../src/host/patch.ts";
import { messageOf, type SurfaceAction } from "../../src/host/workflow.ts";
import { serverError } from "./hooks/fetchText.ts";

export interface PageStore<S> {
  get(): S | null;
  /** Replaces the state with a STATE_SNAPSHOT. */
  set(snapshot: S): void;
  /** Applies a STATE_DELTA; throws on a bad op and keeps the previous state. */
  apply(delta: readonly PatchOp[]): void;
  subscribe(listener: () => void): () => void;
  /** Changes when the code the page shows changes; blob and diff caches key on it. */
  revision(): string;
}

export function createStore<S>(revisionKey?: (state: S) => string): PageStore<S> {
  let state: S | null = null;
  let revision = "";
  const listeners = new Set<() => void>();
  const update = (next: S) => {
    state = next;
    revision = revisionKey ? revisionKey(next) : "";
    for (const listener of [...listeners]) {
      listener();
    }
  };
  return {
    get: () => state,
    set: update,
    apply(delta) {
      if (state === null) {
        throw new Error("a delta arrived before the snapshot");
      }
      update(applyPatchImmutable(state, delta));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    revision: () => revision,
  };
}

export type Conn = "connecting" | "live" | "down";

/** Page-wide status no workflow owns: the connection and the actions in flight. */
export class PageStatus {
  #pending = new Set<string>();
  #conn: Conn = "connecting";
  #listeners = new Set<() => void>();

  conn = () => this.#conn;
  isPending = (key: string) => this.#pending.has(key);
  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };
  setConn(conn: Conn) {
    if (conn === this.#conn) {
      return;
    }
    this.#conn = conn;
    this.#emit();
  }
  setPending(key: string, pending: boolean) {
    if (pending) {
      this.#pending.add(key);
    } else {
      this.#pending.delete(key);
    }
    this.#emit();
  }
  #emit() {
    for (const listener of [...this.#listeners]) {
      listener();
    }
  }
}

export type PostFn = (action: SurfaceAction, key?: string) => Promise<boolean>;

interface Surface {
  store: PageStore<unknown>;
  status: PageStatus;
  post: PostFn;
}

const SurfaceContext = createContext<Surface | null>(null);

type Toast = (text: string, error?: boolean) => void;

/** Posts an action to the page's own server, toasting the server's error when it refuses. */
export function fetchPost(status: PageStatus, toast: Toast): PostFn {
  return async (action, key) => {
    if (key) {
      status.setPending(key, true);
    }
    try {
      const res = await fetch("action", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(action) });
      if (!res.ok) {
        throw new Error(await serverError(res));
      }
      return true;
    } catch (error) {
      toast(messageOf(error), true);
      return false;
    } finally {
      if (key) {
        status.setPending(key, false);
      }
    }
  };
}

export function SurfaceProvider<S>(props: { store: PageStore<S>; status?: PageStatus; post?: PostFn; children?: ReactNode }) {
  // Created once: a constant context value never re-renders its readers.
  const [value] = useState<Surface>(() => {
    const status = props.status ?? new PageStatus();
    // SAFETY: the store is read back only through createSurfaceHooks<S>, whose S is this page's state type.
    const store = props.store as PageStore<unknown>;
    return { store, status, post: props.post ?? fetchPost(status, () => undefined) };
  });
  return createElement(SurfaceContext.Provider, { value }, props.children);
}

function useSurfaceContext(): Surface {
  const surface = useContext(SurfaceContext);
  if (!surface) {
    throw new Error("this component needs a SurfaceProvider above it");
  }
  return surface;
}

/** Typed hooks for one workflow's state and actions. */
export function createSurfaceHooks<S, A extends SurfaceAction>() {
  const stateOf = (store: PageStore<unknown>): S => {
    const state = store.get();
    if (state === null) {
      throw new Error("the page read its state before the first snapshot");
    }
    // SAFETY: SurfaceProvider holds this page's one store, whose state is the S these hooks were made for.
    return state as S;
  };
  function useSelect<T>(selector: (state: S) => T): T {
    const { store } = useSurfaceContext();
    const read = useCallback(() => selector(stateOf(store)), [store, selector]);
    return useSyncExternalStore(store.subscribe, read, read);
  }
  /** Reads the current state from an event handler, without subscribing the component to it. */
  function useReadState(): () => S {
    const { store } = useSurfaceContext();
    return useCallback(() => stateOf(store), [store]);
  }
  function usePost(): (action: A, key?: string) => Promise<boolean> {
    return useSurfaceContext().post;
  }
  return { useSelect, useReadState, usePost };
}

/** True while the action posted under this key is in flight. */
export function usePending(key: string): boolean {
  const { status } = useSurfaceContext();
  const read = useCallback(() => status.isPending(key), [status, key]);
  return useSyncExternalStore(status.subscribe, read, read);
}

export function useConn(): Conn {
  const { status } = useSurfaceContext();
  return useSyncExternalStore(status.subscribe, status.conn, status.conn);
}


/** The store's revision string, which changes when the code the page shows does. */
export function useRevision(): string {
  const { store } = useSurfaceContext();
  return useSyncExternalStore(store.subscribe, store.revision, store.revision);
}
