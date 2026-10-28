import { act, cleanup, render, screen } from "@testing-library/react";
import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { ErrorBoundary } from "./ErrorBoundary.tsx";

afterEach(cleanup);

test("a throwing child shows its message, and Retry remounts it", () => {
  let fail = true;
  function Child() {
    if (fail) {
      throw new Error("bad state");
    }
    return <span>recovered</span>;
  }
  const quiet = mock.method(console, "error", () => undefined);
  try {
    render(
      <ErrorBoundary name="files">
        <Child />
      </ErrorBoundary>,
    );
    assert.ok(screen.getByText("bad state"));
    fail = false;
    act(() => screen.getByRole("button", { name: "Retry" }).click());
    assert.ok(screen.getByText("recovered"));
  } finally {
    quiet.mock.restore();
  }
});
