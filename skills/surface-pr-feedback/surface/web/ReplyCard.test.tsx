import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { renderSurface } from "../../../../test/web/surface.tsx";
import { emptyState, postedBody, type FeedbackItem, type FeedbackState } from "../state.ts";
import { ReplyCard } from "./ReplyCard.tsx";

afterEach(cleanup);

const pr = {
  owner: "acme",
  repo: "w",
  number: 42,
  title: "t",
  url: "https://github.com/acme/w/pull/42",
  author: "me",
  body: "",
  baseRef: "main",
  headRef: "feature",
  baseSha: "a",
  headSha: "b",
  isDraft: false,
  state: "OPEN",
  viewer: "me",
};
const item: FeedbackItem = {
  id: "PF-1",
  source: { kind: "conversation", commentId: 7 },
  author: "bob",
  messages: [{ author: "bob", body: "Please compare strictly", createdAt: "t", mine: false }],
  createdAt: "t",
  decision: "fix",
  discussion: [],
  discussionVisuals: [],
  reply: { body: "Fixed.", status: "draft", assisting: false, updatedAt: "t" },
  hidden: false,
  closed: false,
};
const state: FeedbackState = {
  ...emptyState(),
  pr,
  items: [item],
  commits: [{ id: "K1", message: "Compare strictly", items: ["PF-1"], paths: ["a.ts"], status: "committed", sha: "23e8b833aa", pushed: false }],
};

test("an unpushed commit blocks posting and says why", () => {
  renderSurface(<ReplyCard item={item} />, state);
  assert.ok(screen.getByText(/commit 23e8b833 is not on GitHub yet/));
  assert.equal(screen.getByRole<HTMLButtonElement>("button", { name: "Post to GitHub" }).disabled, true);
});

test("Copy copies the body as GitHub will post it", async () => {
  const copied: string[] = [];
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => void copied.push(text) } });
  renderSurface(<ReplyCard item={item} />, state);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy" })));
  assert.deepEqual(copied, [postedBody(item, "Fixed.")]);
  assert.notEqual(copied[0], "Fixed.");
});
