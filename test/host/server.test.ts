import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { request } from "node:http";
import { join } from "node:path";
import { test } from "node:test";
import { spawnRunner } from "../../src/host/runner.ts";
import { Surface } from "../../src/host/surface.ts";
import { openStream, postAction } from "../sse.ts";
import { counter } from "./counter.ts";

const A = counter("a");

function webRoot() {
  const root = mkdtempSync(join(tmpdir(), "surface-web-"));
  mkdirSync(join(root, "dist"));
  writeFileSync(join(root, "dist", "a.js"), "export {}");
  writeFileSync(join(root, "dist", "chunk-ABC123.js"), "export {}");
  return root;
}

/** fetch drops a custom Host header, so DNS-rebinding checks go through node:http. */
function statusWithHost(url: string, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request(url, { headers: { host } }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on("error", reject);
    req.end();
  });
}

function serve() {
  const notified: string[] = [];
  const s = new Surface(
    { persist: () => undefined, notifyAgent: (_w, content) => notified.push(content), runner: spawnRunner },
    [A, counter("b")],
    webRoot(),
  );
  return { s, notified };
}

test("pages, bundles and routes are served under the token only", async () => {
  const { s } = serve();
  try {
    const index = await s.url();
    const page = await s.url("a");
    const origin = new URL(index).origin;
    assert.match(await (await fetch(index)).text(), /Nothing is open/);
    s.typed(A).session.bump();
    assert.match(await (await fetch(index)).text(), /href="a\/">a page</);
    const shell = await (await fetch(page)).text();
    assert.match(shell, /<script type="module" src="..\/dist\/a.js">/);
    assert.equal((await fetch(new URL("../dist/chunk-ABC123.js", page))).headers.get("content-type"), "text/javascript; charset=utf-8");
    assert.match((await (await fetch(new URL("../dist/b.js", page))).json()).error, /run npm run build/);
    assert.equal((await fetch(new URL("../dist/..%2Fpackage.json", page))).status, 404);
    assert.equal(await (await fetch(new URL("r/echo?q=hi", page))).text(), "echo:hi");
    assert.equal((await fetch(new URL("r/missing", page))).status, 404);
    assert.equal((await fetch(new URL("../nope/", page))).status, 404);
    assert.equal((await fetch(`${origin}/wrong-token/a/`)).status, 404);
    assert.equal(await statusWithHost(page, "evil.example"), 403, "a rebound DNS name is refused");
  } finally {
    await s.close();
  }
});

test("actions need a same-origin JSON post, go through parseAction, and stream only to their workflow", async () => {
  const { s, notified } = serve();
  const pageA = await s.url("a");
  const pageB = await s.url("b");
  const a = await openStream<{ count: number }>(new URL("events", pageA).href);
  const b = await openStream<{ count: number }>(new URL("events", pageB).href);
  try {
    assert.equal((await a.next()).type, "STATE_SNAPSHOT");
    assert.equal((await b.next()).type, "STATE_SNAPSHOT");
    assert.equal((await postAction(pageA, { type: "bump" }, "http://evil.example")).status, 403);
    const wrongType = await fetch(new URL("action", pageA), { method: "POST", headers: { origin: new URL(pageA).origin, "content-type": "text/plain" }, body: "{}" });
    assert.equal(wrongType.status, 415);
    const unknown = await postAction(pageA, { type: "delete" });
    assert.deepEqual([unknown.status, await unknown.json()], [400, { error: 'unknown action type "delete"' }]);
    const refused = await postAction(pageA, { type: "fail" });
    assert.deepEqual([refused.status, await refused.json()], [400, { error: "refused" }]);
    assert.equal((await postAction(pageA, { type: "bump" }, undefined)).status, 202);
    assert.equal((await postAction(pageA, "x".repeat(300 * 1024))).status, 400);
    const delta = await a.next();
    assert.ok(delta.type === "STATE_DELTA" && delta.delta[0].path === "/count");
    await assert.rejects(b.next(300), /timed out/, "a commit to one workflow sends nothing on another's stream");
    assert.deepEqual(notified, ["bumped to 1"]);
  } finally {
    a.close();
    b.close();
    await s.close();
  }
});
