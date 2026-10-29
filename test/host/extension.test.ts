import assert from "node:assert/strict";
import { test } from "node:test";
import { browserArgv, configuredBrowser, defaultBrowser } from "../../extension/browser.ts";
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
  await resumed.command("surface", "open");
  assert.match(resumed.execs.at(-1)!.args.at(-1)!, /\/a\/$/, "the session log names the current workflow");
  await resumed.emit("session_shutdown");
});

test("/surface stop closes the server and clears its links; state survives and /surface starts a new one", async () => {
  const host = fakePi();
  registerSurface(host.pi, [counter("a"), counter("b")]);
  await host.emit("session_start");
  try {
    assert.deepEqual(host.commands.get("surface")!.getArgumentCompletions!("s")?.map((c) => c.value), ["stop"]);
    assert.deepEqual(host.commands.get("surface")!.getArgumentCompletions!("o")?.map((c) => c.value), ["open"]);

    await host.command("surface", "stop");
    assert.equal(host.notices.at(-1), "surface: no server is running");

    const opened = await host.tools.get("surface_a_open")!.execute("c1", {});
    await host.tools.get("surface_a_bump")!.execute("c2", {});
    assert.equal((await fetch(opened.details.url)).status, 200);
    await host.command("surface", "stop");
    assert.equal(host.notices.at(-1), "surface: server stopped; /surface starts it again");
    assert.equal(host.widgets.has("surface:url"), false);
    await assert.rejects(fetch(opened.details.url));
    await host.tools.get("surface_a_bump")!.execute("c3", {});
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(host.widgets.has("surface:url"), false, "a page change after stop does not restart the server");

    await host.command("surface", "a");
    const url = host.notices.at(-1)!.replace("surface: ", "");
    assert.notEqual(url, opened.details.url);
    assert.equal((await fetch(url)).status, 200);
    assert.equal(host.statuses.get("surface:a"), "surface · a page · 2 bumps · /surface a");
    for (let tries = 0; !host.widgets.has("surface:url") && tries < 50; tries++) {
      // oxlint-disable-next-line no-await-in-loop -- polling until the restarted server's URL shows
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.deepEqual(host.widgets.get("surface:url")?.lines, [url]);
  } finally {
    await host.emit("session_shutdown");
  }
});

test("the surface.browser setting picks the program and argv; {url} is filled in or appended", () => {
  const tmux = { command: "tmux", args: ["new-window", "-n", "surface", "terminal-browser", "open", "{url}"] };
  assert.deepEqual(configuredBrowser({ surface: { browser: tmux } }), tmux);
  assert.equal(configuredBrowser({}), undefined);
  assert.deepEqual(configuredBrowser({ surface: { browser: { command: "firefox" } } }), { command: "firefox", args: [] });
  assert.throws(() => configuredBrowser({ surface: { browser: { args: ["x"] } } }), /command/);
  assert.throws(() => configuredBrowser({ surface: { browser: { command: "x", args: [1] } } }), /"surface\.browser\.args\.0"/);
  assert.deepEqual(browserArgv(tmux, "http://h/a/").args, ["new-window", "-n", "surface", "terminal-browser", "open", "http://h/a/"]);
  assert.deepEqual(browserArgv({ command: "firefox", args: ["--new-tab"] }, "http://h/"), { command: "firefox", args: ["--new-tab", "http://h/"] });
  assert.deepEqual(browserArgv(defaultBrowser("darwin"), "http://h/"), { command: "open", args: ["http://h/"] });
  assert.equal(defaultBrowser("linux").command, "xdg-open");
});

test("/surface open reopens the current workflow in the configured browser", async () => {
  const browser = { command: "tmux", args: ["new-window", "terminal-browser", "open", "{url}"] };
  const host = fakePi({ surface: { browser } });
  registerSurface(host.pi, [counter("a"), counter("b")]);
  await host.emit("session_start");
  try {
    await host.command("surface", "open");
    assert.match(host.execs.at(-1)!.args.at(-1)!, /^http:\/\/127\.0\.0\.1:\d+\/[\w-]+\/$/, "with no workflow yet it opens the index");

    await host.tools.get("surface_b_open")!.execute("c1", {});
    await host.tools.get("surface_a_bump")!.execute("c2", {});
    await host.command("surface", "open");
    const last = host.execs.at(-1)!;
    assert.equal(last.command, "tmux");
    assert.deepEqual(last.args.slice(0, 3), ["new-window", "terminal-browser", "open"]);
    assert.match(last.args[3], /\/a\/$/, "the workflow changed last is current");

    await host.command("surface", "open b");
    assert.match(host.execs.at(-1)!.args[3], /\/b\/$/);

    await host.command("surface", "stop");
    await host.command("surface", "open");
    assert.equal((await fetch(host.execs.at(-1)!.args[3])).status, 200, "open restarts a stopped server");
  } finally {
    await host.emit("session_shutdown");
  }
});

test("a malformed surface.browser setting warns and falls back to the default browser", async () => {
  const host = fakePi({ surface: { browser: { command: 42 } } });
  registerSurface(host.pi, [counter("a")]);
  await host.emit("session_start");
  try {
    await host.command("surface", "open");
    assert.equal(host.execs.at(-1)!.command, defaultBrowser(process.platform).command);
    assert.ok(host.notices.some((n) => /surface\.browser setting is invalid \("surface\.browser\.command"/.test(n)));
  } finally {
    await host.emit("session_shutdown");
  }
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
