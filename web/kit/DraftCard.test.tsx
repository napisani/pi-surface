import { cleanup, render, screen } from "@testing-library/react";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import type { GitHubDraft } from "../../src/kit/github-draft.ts";
import { DraftCard, type DraftCardProps } from "./DraftCard.tsx";

afterEach(cleanup);

const draft = (over: Partial<GitHubDraft>): GitHubDraft => ({ body: "Looks off", status: "draft", assisting: false, updatedAt: "t", ...over });
const noop = () => undefined;
const base: Omit<DraftCardProps, "draft"> = {
  kind: "draft",
  head: <b>C1</b>,
  busy: false,
  editing: false,
  assistOpen: false,
  asks: [],
  onEdit: noop,
  onSave: async () => true,
  onAssistOpen: noop,
  onAssist: noop,
  onStopAssist: noop,
  onDelete: noop,
  errorPrefix: "GitHub refused",
};

test("an assisting draft offers Stop waiting", () => {
  render(<DraftCard {...base} draft={draft({ assisting: true })} />);
  assert.ok(screen.getByRole("button", { name: "Stop waiting" }));
});

test("a posted draft has no actions", () => {
  render(<DraftCard {...base} draft={draft({ status: "posted" })} />);
  assert.equal(screen.queryByRole("button"), null);
});

test("a failed draft shows the error with its prefix", () => {
  render(<DraftCard {...base} draft={draft({ status: "failed", error: "422" })} />);
  assert.ok(screen.getByText("GitHub refused: 422"));
});
