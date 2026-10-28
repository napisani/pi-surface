import { act, cleanup, renderHook } from "@testing-library/react";
import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { useHashChoice, useHashState } from "./useHashState.ts";

afterEach(cleanup);
beforeEach(() => {
  window.location.hash = "";
});

const TABS = ["files", "review"] as const;

test("reads, writes and falls back on unknown values", () => {
  window.location.hash = "#tab=bogus";
  const { result } = renderHook(() => useHashChoice("tab", "files", TABS));
  assert.equal(result.current[0], "files");
  act(() => result.current[1]("review"));
  assert.equal(result.current[0], "review");
  assert.equal(new URLSearchParams(window.location.hash.slice(1)).get("tab"), "review");
});

test("components reading the hash share one hashchange listener", () => {
  const added = mock.method(window, "addEventListener");
  try {
    renderHook(() => [useHashState("a", "x"), useHashState("b", "y")]);
    assert.equal(added.mock.calls.filter((call) => call.arguments[0] === "hashchange").length, 1);
  } finally {
    added.mock.restore();
  }
});
