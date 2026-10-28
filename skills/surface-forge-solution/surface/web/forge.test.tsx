import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { renderSurface } from "../../../../test/web/surface.tsx";
import { parseDraft } from "../draft.ts";
import { emptyState, type Draft, type ForgeState, type Question } from "../state.ts";
import { cacheIsolation } from "../test/fixtures.ts";
import { ApprovalBar } from "./ApprovalBar.tsx";
import { DraftDoc } from "./DraftDoc.tsx";
import { QuestionsView } from "./QuestionsView.tsx";

afterEach(cleanup);
beforeEach(() => {
  window.location.hash = "";
});

// The diff lens first, so no test renders mermaid.
function question(): Question {
  const input = cacheIsolation();
  return { ...input, lenses: input.lenses.toReversed(), round: 2, status: "open", thread: [] };
}
const state = (over: Partial<ForgeState> = {}): ForgeState => ({ ...emptyState(), questions: [question(), { ...question(), id: "D4", header: "Store" }], ...over });
const finalDraft: Draft = { writing: false, markdown: "# S", basis: {}, at: "t", final: true, path: ".scratch/specs/s.md" };

test("Request changes without a note focuses the input and posts nothing", () => {
  const { posts } = renderSurface(<ApprovalBar kind="spec" draft={finalDraft} rfcRequested={false} />, state());
  fireEvent.click(screen.getByRole("button", { name: "Request changes" }));
  assert.equal(posts.length, 0);
  assert.equal(document.activeElement, screen.getByPlaceholderText("What to change…"));
});

test("Approve posts draft.review; the RFC option shows only for a spec with no RFC requested", () => {
  const { posts } = renderSurface(<ApprovalBar kind="spec" draft={finalDraft} rfcRequested={false} />, state());
  assert.ok(screen.getByRole("button", { name: "Approve and write an RFC" }));
  fireEvent.click(screen.getByRole("button", { name: "Approve" }));
  assert.deepEqual(posts.at(-1), { action: { type: "draft.review", kind: "spec", verdict: "approve" }, key: "review:spec" });
  cleanup();
  renderSurface(<ApprovalBar kind="rfc" draft={finalDraft} rfcRequested />, state());
  assert.equal(screen.queryByRole("button", { name: "Approve and write an RFC" }), null);
});

test("a TBD chip opens its question", () => {
  const { tree } = parseDraft("## Store\n\nTBD(D4): which store.", "spec");
  renderSurface(<DraftDoc tree={tree} />, state());
  fireEvent.click(screen.getByRole("button", { name: "D4" }));
  const hash = new URLSearchParams(window.location.hash.slice(1));
  assert.equal(hash.get("view"), "q");
  assert.equal(hash.get("question"), "D4");
});

test("picking an option is local until Submit posts the answer with the note", async () => {
  const { posts } = renderSurface(<QuestionsView />, state());
  // The first match is the option card; the radar legend repeats the label.
  fireEvent.click(screen.getAllByText("Defer cache isolation")[0]);
  assert.equal(posts.length, 0);
  fireEvent.change(screen.getByPlaceholderText("Optional note with your answer…"), { target: { value: "later" } });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Submit" })));
  assert.deepEqual(posts.at(-1), { action: { type: "answer", questionId: "D7", optionId: "defer", note: "later" }, key: "answer:D7" });
});
