import assert from "node:assert/strict";
import { test } from "node:test";
import { registerSurface } from "../../../../extension/index.ts";
import { fakePi } from "../../../../test/harness.ts";
import { openStream, postAction } from "../../../../test/sse.ts";
import type { ForgeState } from "../state.ts";
import forgeWorkflow from "../workflow.ts";
import { cacheIsolation } from "./fixtures.ts";

process.env.SURFACE_NO_OPEN = "1";

test("browser actions reach the agent as turn-starting messages, and state survives resume", async () => {
  const host = fakePi();
  registerSurface(host.pi, [forgeWorkflow]);
  await host.emit("session_start");

  const result = await host.tools.get("surface_forge_ask")!.execute("call-1", { questions: [cacheIsolation()] });
  assert.equal(result.terminate, true, "posting a question should end the agent's turn");
  const url: string = result.details.url;
  assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/[\w-]+\/forge\/$/);
  assert.equal(host.statuses.get("surface:forge"), "surface · forge · 1 open · /surface forge");

  const stream = await openStream<ForgeState>(new URL("events", url).href);
  try {
    const snapshot = await stream.next();
    assert.equal(snapshot.type === "STATE_SNAPSHOT" && snapshot.snapshot.questions[0].title, cacheIsolation().title);

    assert.equal((await postAction(url, { type: "followUp", questionId: "D7", optionId: "isolate", text: "Does this cache .env reads?" })).status, 202);
    await stream.next();
    await host.tools.get("surface_forge_reply")!.execute("call-2", {
      questionId: "D7",
      optionId: "isolate",
      text: "No: cache stores remote values; a .env file is a source.",
      revise: { impact: [{ kind: "new", text: "Glossary: cache is not a source" }] },
    });
    const reply = await stream.next();
    assert.ok(reply.type === "STATE_DELTA" && reply.delta.some((op) => op.path.endsWith("/thread/-")));

    assert.equal((await postAction(url, { type: "answer", questionId: "D7", optionId: "defer" })).status, 202);
    const answered = await stream.next();
    assert.ok(answered.type === "STATE_DELTA" && answered.delta.some((op) => op.path === "/decisions/-"));
  } finally {
    stream.close();
  }

  assert.equal(host.sent.length, 2);
  for (const { message, options } of host.sent) {
    assert.equal(message.customType, "surface");
    assert.deepEqual(options, { triggerTurn: true, deliverAs: "followUp" });
  }
  assert.match(host.sent[0].message.content, /^Surface · forge · follow-up · D7/);
  assert.match(host.sent[1].message.content, /^Surface · forge · round 1 complete:\n- D7 Cache isolation: chose "Defer cache isolation", overriding/);
  assert.equal(host.statuses.get("surface:forge"), "surface · forge · 0 open · /surface forge");

  // A fresh runtime must rebuild state from the persisted op batches alone.
  await host.emit("session_shutdown");
  const resumed = fakePi();
  registerSurface(resumed.pi, [forgeWorkflow]);
  await resumed.emit("session_start", host.entries);
  const again = await resumed.tools.get("surface_forge_ask")!.execute("call-3", { questions: [{ ...cacheIsolation(), id: "D8", header: "Next" }] });
  const stream2 = await openStream<ForgeState>(new URL("events", again.details.url).href);
  try {
    const restored = await stream2.next();
    assert.ok(restored.type === "STATE_SNAPSHOT");
    const { questions, decisions } = restored.snapshot;
    assert.deepEqual(questions.map((q) => [q.id, q.status]), [["D7", "answered"], ["D8", "open"]]);
    assert.equal(decisions[0].label, "Defer cache isolation");
    assert.equal(questions[0].thread.length, 2);
    assert.equal(questions[0].options[0].impact?.[0].text, "Glossary: cache is not a source");
  } finally {
    stream2.close();
    await resumed.emit("session_shutdown");
  }
  assert.ok(host.entries.every((e) => e.customType === "surface-ops" && e.data.workflow === "forge" && Array.isArray(e.data.ops)));
});

test("an RFC requested in chat reaches the page without waking the agent", async () => {
  const host = fakePi();
  registerSurface(host.pi, [forgeWorkflow]);
  await host.emit("session_start");
  const { details } = await host.tools.get("surface_forge_ask")!.execute("call-1", { questions: [cacheIsolation()] });
  await host.tools.get("surface_forge_rfc")!.execute("call-2", { requested: true });
  await host.tools.get("surface_forge_rfc")!.execute("call-3", { requested: true });
  const stream = await openStream<ForgeState>(new URL("events", details.url).href);
  try {
    const snapshot = await stream.next();
    assert.ok(snapshot.type === "STATE_SNAPSHOT" && snapshot.snapshot.rfcRequested);
  } finally {
    stream.close();
    await host.emit("session_shutdown");
  }
  assert.equal(host.sent.length, 0);
  assert.equal(host.entries.length, 2, "one batch for the round, one for the request; the repeat persists nothing");
});

test("invalid questions fail the tool call with every problem listed", async () => {
  const host = fakePi();
  registerSurface(host.pi, [forgeWorkflow]);
  await host.emit("session_start");
  const bad = cacheIsolation();
  delete bad.options[1].visuals.diff;
  bad.options[0].scores.correct.value = 9;
  await assert.rejects(host.tools.get("surface_forge_ask")!.execute("call-1", { questions: [bad] }), (error: Error) => {
    assert.match(error.message, /missing lens "diff"/);
    assert.match(error.message, /integer 1-5/);
    return true;
  });
  assert.equal(host.entries.length, 0);
  await host.emit("session_shutdown");
});

test("a draft posted by the agent reaches the page and survives resume", async () => {
  const host = fakePi();
  registerSurface(host.pi, [forgeWorkflow]);
  await host.emit("session_start");
  await host.tools.get("surface_forge_ask")!.execute("call-1", { questions: [cacheIsolation()] });
  const result = await host.tools.get("surface_forge_draft")!.execute("call-2", { kind: "spec", markdown: "# Spec\n\nTBD(D7): cache scope. TBD: retries." });
  assert.equal(result.details.tbds, 2);
  await host.emit("session_shutdown");

  const resumed = fakePi();
  registerSurface(resumed.pi, [forgeWorkflow]);
  await resumed.emit("session_start", host.entries);
  const again = await resumed.tools.get("surface_forge_ask")!.execute("call-3", { questions: [{ ...cacheIsolation(), id: "D8", header: "Next" }] });
  const stream = await openStream<ForgeState>(new URL("events", again.details.url).href);
  try {
    const restored = await stream.next();
    assert.ok(restored.type === "STATE_SNAPSHOT" && restored.snapshot.drafts.spec?.markdown.startsWith("# Spec"));
  } finally {
    stream.close();
    await resumed.emit("session_shutdown");
  }
  assert.equal(host.sent.length, 0, "posting a draft wakes no one");
});
