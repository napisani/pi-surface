import assert from "node:assert/strict";
import { test } from "node:test";
import { registerSurface } from "../../../../extension/index.ts";
import { fakePi } from "../../../../test/harness.ts";
import { openStream, postAction } from "../../../../test/sse.ts";
import type { EntropyState } from "../state.ts";
import entropyWorkflow from "../workflow.ts";
import { inlineLoader, isoDatesOnly } from "./fixtures.ts";

process.env.SURFACE_NO_OPEN = "1";

test("decisions reach the agent as one message when the user sends them, and state survives resume", async () => {
  const host = fakePi();
  registerSurface(host.pi, [entropyWorkflow]);
  await host.emit("session_start");

  const result = await host.tools.get("surface_entropy_findings")!.execute("call-1", { scope: "src/config/ at main", findings: [inlineLoader(), isoDatesOnly()] });
  assert.equal(result.terminate, true, "posting findings should end the agent's turn");
  const url: string = result.details.url;
  assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/[\w-]+\/entropy\/$/);
  assert.equal(host.statuses.get("surface:entropy"), "surface · entropy · 2 open · /surface entropy");

  const stream = await openStream<EntropyState>(new URL("events", url).href);
  try {
    const snapshot = await stream.next();
    assert.equal(snapshot.type === "STATE_SNAPSHOT" && snapshot.snapshot.scope, "src/config/ at main");

    assert.equal((await postAction(url, { type: "followUp", findingId: "F2", text: "Who still sends US dates?" })).status, 202);
    await stream.next();
    await host.tools.get("surface_entropy_reply")!.execute("call-2", { findingId: "F2", text: "Only the 2019 import fixtures.", revise: { lines: 150 } });
    await stream.next();

    assert.equal((await postAction(url, { type: "decide", findingId: "F1", verdict: "accept" })).status, 202);
    await stream.next();
    assert.equal((await postAction(url, { type: "decide", findingId: "F2", verdict: "decline", note: "keep for now" })).status, 202);
    await stream.next();
    assert.equal(host.sent.length, 1, "deciding does not wake the agent");
    assert.equal((await postAction(url, { type: "submit" })).status, 202);
    await stream.next();
  } finally {
    stream.close();
  }

  assert.equal(host.sent.length, 2);
  for (const { message, options } of host.sent) {
    assert.equal(message.customType, "surface");
    assert.deepEqual(options, { triggerTurn: true, deliverAs: "followUp" });
  }
  assert.match(host.sent[0].message.content, /^Surface · entropy · follow-up · F2/);
  assert.match(host.sent[1].message.content, /^Surface · entropy · decisions sent:\n- F1 .*accepted \(your recommendation\)\.\n- F2 .*declined, overriding/);

  await host.emit("session_shutdown");
  const resumed = fakePi();
  registerSurface(resumed.pi, [entropyWorkflow]);
  await resumed.emit("session_start", host.entries);
  const again = await resumed.tools.get("surface_entropy_findings")!.execute("call-3", { findings: [{ ...inlineLoader(), id: "F3", after: ["F2"] }] });
  const stream2 = await openStream<EntropyState>(new URL("events", again.details.url).href);
  try {
    const restored = await stream2.next();
    assert.ok(restored.type === "STATE_SNAPSHOT");
    const { findings, batch } = restored.snapshot;
    assert.equal(batch, 2);
    assert.deepEqual(findings.map((f) => [f.id, f.status]), [["F1", "accepted"], ["F2", "declined"], ["F3", "open"]]);
    assert.equal(findings[1].thread.length, 2);
    assert.equal(findings[1].lines, 150);
  } finally {
    stream2.close();
    await resumed.emit("session_shutdown");
  }
});
