import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { renderSurface } from "../../../../test/web/surface.tsx";
import { emptyState, type EntropyState, type Finding } from "../state.ts";
import { inlineLoader, isoDatesOnly } from "../test/fixtures.ts";
import { FindingsView } from "./FindingsView.tsx";
import { SendButton } from "./SendDecisions.tsx";

afterEach(cleanup);
beforeEach(() => {
  window.location.hash = "";
});

const finding = (over: Partial<Finding> = {}): Finding => ({ ...inlineLoader(), batch: 1, status: "open", thread: [], ...over });
const state = (findings: Finding[]): EntropyState => ({ ...emptyState(), scope: "src/config/", batch: 1, findings });

test("the smallest open concession shows first, and Accept posts the decision with its note", async () => {
  const { posts } = renderSurface(<FindingsView />, state([{ ...isoDatesOnly(), batch: 1, status: "open", thread: [] }, finding()]));
  assert.ok(screen.getByRole("heading", { name: "Inline the config loader interface" }));
  fireEvent.change(screen.getByPlaceholderText("Optional note with your decision…"), { target: { value: "  yes  " } });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Accept" })));
  assert.deepEqual(posts.at(-1), { action: { type: "decide", findingId: "F1", verdict: "accept", note: "yes" }, key: "decide:F1" });
});

test("a decided finding shows its decision and Reopen instead of the decision bar", () => {
  const { posts } = renderSurface(<FindingsView />, state([finding({ status: "declined", note: "later" })]));
  assert.equal(screen.queryByRole("button", { name: "Accept" }), null);
  assert.ok(screen.getByText(/Declined/));
  fireEvent.click(screen.getByRole("button", { name: "Reopen" }));
  assert.deepEqual(posts.at(-1), { action: { type: "reopen", findingId: "F1" }, key: undefined });
});

test("Send stays disabled until every finding is decided, then posts submit, then reads Sent", () => {
  const { posts, setState } = renderSurface(<SendButton />, state([finding(), { ...isoDatesOnly(), batch: 1, status: "accepted", thread: [] }]));
  assert.ok(screen.getByRole("button", { name: "Decide 1 more to send" }).hasAttribute("disabled"));
  setState(state([finding({ status: "declined" }), { ...isoDatesOnly(), batch: 1, status: "accepted", thread: [] }]));
  fireEvent.click(screen.getByRole("button", { name: "Send decisions to the agent" }));
  assert.deepEqual(posts.at(-1), { action: { type: "submit" }, key: "submit" });
  setState({ ...state([finding({ status: "declined" })]), submitted: true });
  assert.ok(screen.getByText("✓ Sent to the agent"));
});
