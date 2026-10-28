import assert from "node:assert/strict";
import { after, test } from "node:test";
import { registerSurface } from "../../../../extension/index.ts";
import { fakePi } from "../../../../test/harness.ts";
import { openStream, postAction } from "../../../../test/sse.ts";
import reviewWorkflow from "../workflow.ts";
import { fakeGh, findingsInput, makeRepo } from "./fixtures.ts";

process.env.SURFACE_NO_OPEN = "1";

const repo = makeRepo();
const gh = fakeGh(repo);
after(() => gh.restore());

test("page requests reach the agent as turns, tool errors are readable, and state survives resume", async () => {
  const host = fakePi();
  registerSurface(host.pi, [reviewWorkflow]);
  await host.emit("session_start");

  await assert.rejects(host.tools.get("surface_review_findings")!.execute("c0", findingsInput()), /nothing is loaded/);
  const opened = await host.tools.get("surface_review_open")!.execute("c1", { pr: "42", worktree: repo.root, live: false });
  assert.equal(opened.terminate, true);
  assert.match(opened.content[0].text, /pinned review against main[\s\S]*4 files \(1 impl, 1 test, 1 docs, 1 config\)/);
  const url: string = opened.details.url;

  const stream = await openStream(new URL("events", url).href);
  try {
    assert.equal((await stream.next()).type, "STATE_SNAPSHOT");
    assert.equal((await postAction(url, { type: "review.run" })).status, 202);
    await stream.next();
  } finally {
    stream.close();
  }
  assert.equal(host.sent.length, 1);
  assert.deepEqual(host.sent[0].options, { triggerTurn: true, deliverAs: "followUp" });
  assert.match(host.sent[0].message.content, /^Surface · review · run the multi-valued review/);

  const published = await host.tools.get("surface_review_findings")!.execute("c2", findingsInput());
  assert.equal(published.terminate, true);
  const drafted = await host.tools.get("surface_review_comment_draft")!.execute("c3", { findingId: "F1", body: "Use ===." });
  assert.equal(drafted.details.commentId, "C1");
  await assert.rejects(host.tools.get("surface_review_comment_draft")!.execute("c4", { anchor: { path: "nope.ts", side: "RIGHT", line: 1 }, body: "x" }), /not in this diff/);
  assert.equal(gh.posts().length, 0, "agent tools never post");

  await host.emit("session_shutdown");
  const resumed = fakePi();
  registerSurface(resumed.pi, [reviewWorkflow]);
  await resumed.emit("session_start", host.entries);
  const again = await resumed.tools.get("surface_review_comment_draft")!.execute("c5", { commentId: "C1", body: "Use `===` here." });
  assert.equal(again.details.commentId, "C1");
  await resumed.emit("session_shutdown");
});
