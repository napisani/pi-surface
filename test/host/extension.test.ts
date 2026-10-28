import assert from "node:assert/strict";
import { test } from "node:test";
import { registerSurface, WORKFLOWS } from "../../extension/index.ts";
import { SurfaceError } from "../../src/host/workflow.ts";
import { fakePi } from "../harness.ts";
import { postAction } from "../sse.ts";
import { counter } from "./counter.ts";

process.env.SURFACE_NO_OPEN = "1";

test("only opening tools are declared until their workflow opens, and opening declares the rest once", async () => {
  const host = fakePi();
  registerSurface(host.pi, [counter("a"), counter("b")]);
  await host.emit("session_start");
  assert.deepEqual(host.active(), ["surface_a_open", "surface_b_open"]);

  await host.tools.get("surface_a_open")!.execute("c1", {});
  await host.tools.get("surface_a_open")!.execute("c2", {});
  assert.deepEqual(host.active().sort(), ["surface_a_bump", "surface_a_open", "surface_b_open"]);
  assert.equal(host.setActiveCalls.length, 1, "the tool list changes once per workflow");
  await host.emit("session_shutdown");
});

test("expected failures become plain tool errors; page events wake the agent with the workflow named", async () => {
  const host = fakePi();
  registerSurface(host.pi, [counter("a")]);
  await host.emit("session_start");
  await assert.rejects(host.tools.get("surface_a_bump")!.execute("c1", { fail: true }), (error: Error) => {
    assert.equal(error.message, "cannot bump");
    assert.ok(!(error instanceof SurfaceError));
    return true;
  });
  const opened = await host.tools.get("surface_a_open")!.execute("c2", {});
  assert.equal(opened.terminate, true);
  assert.match(opened.content[0].text, /page bundle is missing/);
  assert.equal((await postAction(opened.details.url, { type: "bump" })).status, 202);
  assert.deepEqual(host.sent, [
    { message: { customType: "surface", content: "Surface · a · bumped to 1", display: true, details: { workflow: "a", action: { type: "bump" } } }, options: { triggerTurn: true, deliverAs: "followUp" } },
  ]);
  assert.equal(host.statuses.get("surface:a"), "surface · a page · 1 bumps · /surface a");
  assert.deepEqual(host.widgets.get("surface:url"), { lines: [opened.details.url], placement: "belowEditor" });
  await host.emit("session_shutdown");
  assert.equal(host.widgets.has("surface:url"), false, "a closed session shows no URL");
});

test("resume rebuilds state from the active branch and declares the tools of workflows that have state", async () => {
  const host = fakePi();
  registerSurface(host.pi, [counter("a"), counter("b")]);
  await host.emit("session_start");
  await host.tools.get("surface_a_bump")!.execute("c1", {});
  await host.emit("session_shutdown");

  const resumed = fakePi();
  registerSurface(resumed.pi, [counter("a"), counter("b")]);
  await resumed.emit("session_start", [...host.entries, { type: "custom", customType: "other-ops", data: { workflow: "a", ops: [] } }]);
  assert.deepEqual(resumed.active().sort(), ["surface_a_bump", "surface_a_open", "surface_b_open"]);
  assert.equal(resumed.statuses.get("surface:a"), "surface · a page · 1 bumps · /surface a");
  // The server starts on resume so the URL can show; that is asynchronous.
  for (let tries = 0; !resumed.widgets.has("surface:url") && tries < 50; tries++) {
    // oxlint-disable-next-line no-await-in-loop -- polling until the server has started
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.match(resumed.widgets.get("surface:url")?.lines.join("\n") ?? "", /^http:\/\/127\.0\.0\.1:\d+\/[\w-]+\/a\/$/, "only the workflow with state shows its URL");
  await resumed.emit("session_shutdown");
});

test("the extension registers every workflow's tools under the surface prefix", async () => {
  const host = fakePi();
  registerSurface(host.pi);
  assert.deepEqual(WORKFLOWS.map((w) => w.id), ["forge", "review", "feedback"]);
  assert.ok([...host.tools.keys()].every((name) => name.startsWith("surface_")));
  assert.deepEqual(
    [...host.tools.values()].filter((t) => t.defaultActive).map((t) => t.name),
    ["surface_forge_ask", "surface_review_open", "surface_feedback_open"],
  );
  assert.equal(host.tools.size, 20);
});
