import { cleanup, fireEvent, screen } from "@testing-library/react";
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import type { TourStep } from "../../src/kit/tour.ts";
import { renderSurface } from "../../test/web/surface.tsx";
import { Tour } from "./Tour.tsx";

const realFetch = globalThis.fetch;
// The code panel loads its file over the page's blob route; there is no server here.
beforeEach(() => {
  globalThis.fetch = async () => new Response("const a = 1;\n");
});
afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
});

const step = (n: number): TourStep => ({
  id: `s${n}`,
  title: `Step ${n}`,
  body: "Body",
  ref: { path: `src/f${n}.ts`, startLine: 1, endLine: 2, rev: "head" },
});
const steps = [step(1), step(2), step(3)];

function mount(go: (index: number) => void) {
  return renderSurface(<Tour steps={steps} index={1} go={go} extras={<textarea aria-label="ask" />} />, {});
}

test("no key changes the step, in the ask box or out of it", () => {
  const seen: number[] = [];
  mount((i) => seen.push(i));
  const layout = screen.getByRole("list").parentElement!;
  const ask = screen.getByLabelText("ask");
  for (const target of [layout, ask]) {
    for (const key of ["j", "k", "ArrowLeft", "ArrowRight"]) {
      fireEvent.keyDown(target, { key });
    }
  }
  assert.deepEqual(seen, []);
});

test("the Prev and Next buttons still move between steps", () => {
  const seen: number[] = [];
  mount((i) => seen.push(i));
  fireEvent.click(screen.getByRole("button", { name: "← Prev" }));
  fireEvent.click(screen.getByRole("button", { name: "Next →" }));
  assert.deepEqual(seen, [0, 2]);
});
