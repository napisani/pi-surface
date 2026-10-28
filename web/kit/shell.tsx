// The page every workflow runs in: the state stream, the store, the header
// when nothing is loaded, toasts, and the outer error boundary.
// The global theme loads first so component modules override its element styles.
import "./theme.css";
import { useSyncExternalStore, type ComponentType, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { ServerEvent } from "../../src/host/server.ts";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { PageHeader } from "./PageHeader.tsx";
import { EmptyState } from "./primitives/EmptyState.tsx";
import css from "./shell.module.css";
import { createStore, fetchPost, PageStatus, SurfaceProvider, type PageStore } from "./store.ts";
import { toast } from "./toast.ts";
import { Toaster } from "./Toaster.tsx";

export interface WorkflowMount<S> {
  /** The workflow's root, rendered once the state has something to show. */
  Page: ComponentType;
  brand: string;
  /** What to show before the agent loads anything. */
  empty: string;
  loaded(state: S): boolean;
  /** Changes when the code the page shows changes; blob and diff caches key on it. */
  revisionKey?(state: S): string;
}

export function PageMain({ className, children }: { className?: string; children?: ReactNode }) {
  return <main className={className ? `${css.main} ${className}` : css.main}>{children}</main>;
}

function Shell<S>({ store, mount }: { store: PageStore<S>; mount: WorkflowMount<S> }) {
  const read = () => {
    const state = store.get();
    return state !== null && mount.loaded(state);
  };
  const loaded = useSyncExternalStore(store.subscribe, read, read);
  const { Page } = mount;
  return loaded ? (
    <Page />
  ) : (
    <>
      <PageHeader brand={mount.brand} />
      <PageMain>
        <EmptyState title="Nothing loaded yet.">{mount.empty}</EmptyState>
      </PageMain>
    </>
  );
}

/** Connects to the workflow's state stream and renders its page. */
export function mountWorkflow<S>(mount: WorkflowMount<S>): void {
  const store = createStore<S>(mount.revisionKey);
  const status = new PageStatus();
  const source = new EventSource("events");
  source.onopen = () => status.setConn("live");
  source.onerror = () => status.setConn("down");
  source.onmessage = (event) => {
    // SAFETY: the page's own server sends only ServerEvents over this workflow's state.
    const message = JSON.parse(event.data) as ServerEvent<S>;
    try {
      if (message.type === "STATE_SNAPSHOT") {
        store.set(message.snapshot);
      } else {
        store.apply(message.delta);
      }
    } catch (error) {
      // The store kept its last good state; the next snapshot, sent on reconnect, recovers.
      // oxlint-disable-next-line no-console -- a bad delta is a bug; the console is where it can be read before the reload
      console.error("surface: could not apply a state change", error);
      status.setConn("down");
      source.close();
      setTimeout(() => window.location.reload(), 1500);
    }
  };
  createRoot(document.getElementById("app")!).render(
    <SurfaceProvider store={store} status={status} post={fetchPost(status, toast)}>
      <ErrorBoundary name="page">
        <Shell store={store} mount={mount} />
      </ErrorBoundary>
      <Toaster />
    </SurfaceProvider>,
  );
}
