import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { TaskBanner } from "./TaskBanner.tsx";

afterEach(cleanup);

test("a running task shows its note and a Stop button; a finished one shows nothing", () => {
  let stopped = 0;
  const onStop = () => stopped++;
  const { rerender } = render(<TaskBanner task={{ status: "running", note: "lenses running" }} running="Reviewing…" failed="Review failed" onStop={onStop} />);
  assert.ok(screen.getByText("lenses running"));
  fireEvent.click(screen.getByRole("button", { name: "Stop" }));
  assert.equal(stopped, 1);
  rerender(<TaskBanner task={{ status: "done" }} running="Reviewing…" failed="Review failed" onStop={onStop} />);
  assert.equal(screen.queryByRole("button"), null);
});
