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

test("a question about the reply posts reply.ask and its thread shows on the card", async () => {
  const asked: FeedbackItem = { ...item, replyThread: [{ role: "user", text: "Why name the commit?", at: "t" }] };
  const { posts } = renderSurface(<ReplyCard item={asked} />, { ...state, items: [asked] });
  assert.ok(screen.getByText("Why name the commit?"));
  assert.ok(screen.getByText(/The agent is reading the reply/));
  fireEvent.change(screen.getByPlaceholderText(/Ask about this reply/), { target: { value: "Is it too long?" } });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Ask" })));
  assert.deepEqual(posts.at(-1), { action: { type: "reply.ask", itemId: "PF-1", text: "Is it too long?" }, key: "reply-ask-PF-1" });
});
