import { act, cleanup, render, renderHook } from "@testing-library/react";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import type { ReactNode } from "react";
import type { SurfaceAction } from "../../src/host/workflow.ts";
import { createStore, createSurfaceHooks, fetchPost, PageStatus, SurfaceProvider, usePending } from "./store.ts";

afterEach(cleanup);

interface S {
  a: { n: number };
  b: { n: number };
}

const { useSelect } = createSurfaceHooks<S, SurfaceAction>();
const selectA = (s: S) => s.a;

test("useSelect re-renders only when its slice changes", () => {
  const store = createStore<S>();
  store.set({ a: { n: 1 }, b: { n: 1 } });
  let renders = 0;
  function Probe() {
    renders++;
    return <span>{useSelect(selectA).n}</span>;
  }
  const { container } = render(
    <SurfaceProvider store={store}>
      <Probe />
    </SurfaceProvider>,
  );
  assert.equal(renders, 1);
  act(() => store.apply([{ op: "replace", path: "/b/n", value: 2 }]));
  assert.equal(renders, 1);
  act(() => store.apply([{ op: "replace", path: "/a/n", value: 5 }]));
  assert.equal(renders, 2);
  assert.equal(container.textContent, "5");
});

test("fetchPost posts JSON to action and tracks the pending key", async () => {
  const status = new PageStatus();
  const sent: { url: string; body: string }[] = [];
  let release!: (response: Response) => void;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    sent.push({ url: String(input), body: String(init?.body) });
    return new Promise<Response>((resolve) => (release = resolve));
  };
  const store = createStore<S>();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SurfaceProvider store={store} status={status} post={fetchPost(status, () => undefined)}>
      {children}
    </SurfaceProvider>
  );
  const { result } = renderHook(() => usePending("go"), { wrapper });
  const post = fetchPost(status, () => undefined);
  let done!: Promise<boolean>;
  act(() => {
    done = post({ type: "x" }, "go");
  });
  assert.equal(result.current, true);
  await act(async () => {
    release(new Response("{}", { status: 200 }));
    assert.equal(await done, true);
  });
  assert.equal(result.current, false);
  assert.deepEqual(sent, [{ url: "action", body: '{"type":"x"}' }]);
});

test("fetchPost toasts the server's error and resolves false", async () => {
  const toasts: [string, boolean | undefined][] = [];
  globalThis.fetch = async () => new Response(JSON.stringify({ error: "no such comment" }), { status: 400 });
  const ok = await fetchPost(new PageStatus(), (text, error) => toasts.push([text, error]))({ type: "x" });
  assert.equal(ok, false);
  assert.deepEqual(toasts, [["no such comment", true]]);
});
