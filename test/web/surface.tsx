// Renders a component inside a SurfaceProvider seeded with a state and a fake
// post that records every action, for workflow component tests.
import { act, render } from "@testing-library/react";
import type { ReactElement } from "react";
import type { SurfaceAction } from "../../src/host/workflow.ts";
import { createStore, PageStatus, SurfaceProvider } from "../../web/kit/store.ts";

export interface Posted {
  action: SurfaceAction;
  key?: string;
}

export function renderSurface<S>(ui: ReactElement, state: S, reply: (action: SurfaceAction) => boolean = () => true) {
  const store = createStore<S>();
  store.set(state);
  const status = new PageStatus();
  const posts: Posted[] = [];
  const post = async (action: SurfaceAction, key?: string) => {
    // Recorded as the server receives it: JSON drops fields left undefined.
    posts.push({ action: JSON.parse(JSON.stringify(action)), key });
    return reply(action);
  };
  const result = render(
    <SurfaceProvider store={store} status={status} post={post}>
      {ui}
    </SurfaceProvider>,
  );
  const setState = (next: S) => act(() => store.set(next));
  return { ...result, store, status, posts, setState };
}
