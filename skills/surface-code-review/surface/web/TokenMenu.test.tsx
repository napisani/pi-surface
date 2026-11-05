import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { NO_FILTERS } from "./lineItems.ts";
import { TokenMenu } from "./TokenMenu.tsx";
import { filterStore, tokenMenuStore } from "./ui.ts";

afterEach(() => {
  cleanup();
  tokenMenuStore.set(null);
  filterStore.set(NO_FILTERS);
});

test("a clicked token's menu filters the files to changes with it, then can clear that filter", () => {
  render(<TokenMenu />);
  assert.equal(screen.queryByRole("menu"), null);
  act(() => tokenMenuStore.set({ token: "checkToken", x: 10, y: 10 }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Show only changes with this" }));
  assert.equal(filterStore.get().token, "checkToken");
  assert.equal(screen.queryByRole("menu"), null, "choosing closes the menu");

  act(() => tokenMenuStore.set({ token: "other", x: 10, y: 10 }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Clear the token filter" }));
  assert.equal(filterStore.get().token, "");
});

test("Escape closes the menu without changing the filters", () => {
  render(<TokenMenu />);
  act(() => tokenMenuStore.set({ token: "x", x: 10, y: 10 }));
  fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
  assert.equal(screen.queryByRole("menu"), null);
  assert.equal(filterStore.get().token, "");
});
