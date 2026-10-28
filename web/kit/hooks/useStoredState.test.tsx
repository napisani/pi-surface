import { act, cleanup, renderHook } from "@testing-library/react";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { useStoredState } from "./useStoredState.ts";

afterEach(cleanup);

test("stores under the surface:v1: prefix", () => {
  const { result } = renderHook(() => useStoredState("diffStyle-a", "split"));
  act(() => result.current[1]("unified"));
  assert.equal(result.current[0], "unified");
  assert.equal(localStorage.getItem("surface:v1:diffStyle-a"), '"unified"');
});

test("a bad stored value reads as the fallback", () => {
  localStorage.setItem("surface:v1:diffStyle-b", "{not json");
  const { result } = renderHook(() => useStoredState("diffStyle-b", "split"));
  assert.equal(result.current[0], "split");
});
