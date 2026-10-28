import assert from "node:assert/strict";
import { after, test } from "node:test";
import { registerSurface } from "../../../../extension/index.ts";
import { fakePi } from "../../../../test/harness.ts";
import { openStream, postAction } from "../../../../test/sse.ts";
import feedbackWorkflow from "../workflow.ts";
import { analysis, fakeGh, makeRepo } from "./fixtures.ts";

process.env.SURFACE_NO_OPEN = "1";

const repo = makeRepo();
const gh = fakeGh(repo);
after(() => gh.restore());

test("open hands the agent its triage, page requests become turns, and state survives resume", async () => {
  const host = fakePi();
  registerSurface(host.pi, [feedbackWorkflow]);
  await host.emit("session_start");

  await assert.rejects(host.tools.get("surface_feedback_triage")!.execute("c0", { analyses: [analysis("PF-1")] }), /nothing is loaded/);
  const opened = await host.tools.get("surface_feedback_open")!.execute("c1", { pr: "42", worktree: repo.root });
  assert.equal(opened.terminate, undefined, "the agent keeps its turn to triage");
  assert.match(opened.content[0].text, /5 feedback items \(1 hidden bot comments\)[\s\S]*Triage these now[\s\S]*Items to triage \(4\)/);
  const url: string = opened.details.url;

  const triaged = await host.tools.get("surface_feedback_triage")!.execute("c2", { analyses: [analysis("PF-1"), analysis("PF-2"), analysis("PF-3"), analysis("PF-4")] });
  assert.equal(triaged.terminate, true);
  await assert.rejects(host.tools.get("surface_feedback_triage")!.execute("c3", { analyses: [analysis("PF-1", { refs: [{ path: "/etc/passwd", rev: "work", startLine: 1, endLine: 1 }] })] }), /not a repository-relative path/);

  const stream = await openStream(new URL("events", url).href);
  try {
    assert.equal((await stream.next()).type, "STATE_SNAPSHOT");
    assert.equal((await postAction(url, { type: "item.ask", itemId: "PF-3", text: "Which test file?" })).status, 202);
    await stream.next();
  } finally {
    stream.close();
  }
  assert.equal(host.sent.length, 1);
  assert.deepEqual(host.sent[0].options, { triggerTurn: true, deliverAs: "followUp" });
  assert.match(host.sent[0].message.content, /^Surface · feedback · question about PF-3/);

  const drafted = await host.tools.get("surface_feedback_reply_draft")!.execute("c4", { itemId: "PF-3", body: "Added it in src/auth.test.ts." });
  assert.equal(drafted.terminate, undefined, "drafting several replies takes several calls");
  assert.equal(gh.writes().length, 0, "agent tools never post");

  await host.emit("session_shutdown");
  const resumed = fakePi();
  registerSurface(resumed.pi, [feedbackWorkflow]);
  await resumed.emit("session_start", host.entries);
  const again = await resumed.tools.get("surface_feedback_reply_draft")!.execute("c5", { itemId: "PF-3", body: "Added `empty token fails` to src/auth.test.ts." });
  assert.equal(again.details.itemId, "PF-3");
  await resumed.emit("session_shutdown");
});
