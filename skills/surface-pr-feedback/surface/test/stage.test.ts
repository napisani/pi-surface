import assert from "node:assert/strict";
import { test } from "node:test";
import type { FeedbackItem } from "../state.ts";
import { listGroups, stageOf, stepFrom } from "../web/stage.ts";

const item = (id: string, over: Partial<FeedbackItem> = {}): FeedbackItem => ({
  id,
  source: { kind: "conversation", commentId: 1 },
  author: "bob",
  messages: [],
  createdAt: "t",
  decision: "undecided",
  discussion: [],
  discussionVisuals: [],
  hidden: false,
  closed: false,
  ...over,
});

test("stageOf covers every stage", () => {
  assert.equal(stageOf(item("a")), "decide");
  assert.equal(stageOf(item("b", { decision: "fix", fix: { status: "sent", messages: [], files: [] } })), "fixing");
  assert.equal(stageOf(item("c", { decision: "fix", fix: { status: "done", messages: [], files: [] } })), "reply");
  assert.equal(stageOf(item("d", { decision: "skip" })), "reply");
  assert.equal(stageOf(item("e", { closed: true })), "done");
  assert.equal(stageOf(item("f", { source: { kind: "thread", rootId: 1, resolved: true, outdated: false } })), "done");
});

test("listGroups orders by stage and hides what the filter hides", () => {
  const items = [item("done", { closed: true }), item("hidden", { hidden: true }), item("open"), item("replying", { decision: "respond" })];
  const groups = listGroups(items, { showHidden: false, showDone: false });
  assert.deepEqual(
    groups.map((g) => [g.stage, g.items.map((i) => i.id)]),
    [
      ["decide", ["open"]],
      ["reply", ["replying"]],
    ],
  );
});

test("stepFrom moves within the list and starts at the top", () => {
  const order = [item("a"), item("b"), item("c")];
  assert.equal(stepFrom(order, undefined, 1), "a");
  assert.equal(stepFrom(order, "a", 1), "b");
  assert.equal(stepFrom(order, "c", 1), "c");
  assert.equal(stepFrom(order, "a", -1), "a");
});
