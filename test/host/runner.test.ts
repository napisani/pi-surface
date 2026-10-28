import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnRunner } from "../../src/host/runner.ts";

test("a command that exits without reading stdin needs no input write", async () => {
  const result = await spawnRunner(process.execPath, ["-e", "process.exit(0)"], { cwd: process.cwd() });
  assert.deepEqual(result, { stdout: "", stderr: "", code: 0 });
});

test("stdin failures reject the command instead of becoming uncaught stream errors", async () => {
  await assert.rejects(
    spawnRunner(process.execPath, ["-e", "process.exit(0)"], { cwd: process.cwd(), input: "x".repeat(16 * 1024 * 1024) }),
    { code: "EPIPE" },
  );
});

test("commands receive their input and report stdout, stderr, and exit status", async () => {
  const result = await spawnRunner(process.execPath, ["-e", "process.stdin.pipe(process.stdout); process.stderr.write('notice'); process.exitCode = 7;"], { cwd: process.cwd(), input: "payload" });
  assert.deepEqual(result, { stdout: "payload", stderr: "notice", code: 7 });
});
