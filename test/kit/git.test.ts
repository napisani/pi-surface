import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDiffFiles } from "../../src/kit/git.ts";

test("a unified diff splits into files, with renames, binaries, new and deleted files", () => {
  const diff = [
    "diff --git a/src/a.ts b/src/a.ts",
    "index 1..2 100644",
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "@@ -1,2 +1,3 @@",
    " keep",
    "-old",
    "+new",
    "+more",
    "diff --git a/docs/old.md b/docs/new.md",
    "similarity index 100%",
    "rename from docs/old.md",
    "rename to docs/new.md",
    "diff --git a/img/logo.png b/img/logo.png",
    "new file mode 100644",
    "Binary files /dev/null and b/img/logo.png differ",
    "diff --git a/gone.yaml b/gone.yaml",
    "deleted file mode 100644",
    "--- a/gone.yaml",
    "+++ /dev/null",
    "@@ -1 +0,0 @@",
    "-mode: strict",
    "",
  ].join("\n");
  const files = parseDiffFiles(diff);
  assert.deepEqual(
    files.map(({ fingerprint, ...f }) => (assert.match(fingerprint, /^[0-9a-f]{12}$/), f)),
    [
      { path: "src/a.ts", status: "modified", additions: 2, deletions: 1, binary: false, category: "impl" },
      { path: "docs/new.md", previousPath: "docs/old.md", status: "renamed", additions: 0, deletions: 0, binary: false, category: "docs" },
      { path: "img/logo.png", status: "added", additions: 0, deletions: 0, binary: true, category: "impl" },
      { path: "gone.yaml", status: "deleted", additions: 0, deletions: 1, binary: false, category: "config" },
    ],
  );
});


test("blobs read each revision, refuse revisions the page lacks, and stay inside the worktree", async () => {
  const { execFileSync } = await import("node:child_process");
  const { mkdtempSync, symlinkSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { spawnRunner } = await import("../../src/host/runner.ts");
  const { blobRoute, readBlob } = await import("../../src/kit/git.ts");
  const root = mkdtempSync(join(tmpdir(), "surface-blob-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } }).trim();
  git("init", "-q", "-b", "main");
  writeFileSync(join(root, "a.txt"), "one\n");
  git("add", "-A");
  git("commit", "-q", "-m", "one");
  const base = git("rev-parse", "HEAD");
  writeFileSync(join(root, "a.txt"), "two\n");
  git("commit", "-qam", "two");
  const head = git("rev-parse", "HEAD");
  writeFileSync(join(root, "a.txt"), "three\n");
  symlinkSync("/etc/hosts", join(root, "escape"));

  const revs = { worktree: root, base, head, work: true };
  assert.equal(await readBlob(spawnRunner, revs, "base", "a.txt"), "one\n");
  assert.equal(await readBlob(spawnRunner, revs, "head", "a.txt"), "two\n");
  assert.equal(await readBlob(spawnRunner, revs, "work", "a.txt"), "three\n");
  await assert.rejects(readBlob(spawnRunner, revs, "since", "a.txt"), /"since" is not a revision this page can read/);
  await assert.rejects(readBlob(spawnRunner, { ...revs, work: false }, "work", "a.txt"), /not a revision/);
  await assert.rejects(readBlob(spawnRunner, revs, "work", "escape"), /outside the worktree/);
  await assert.rejects(readBlob(spawnRunner, revs, "head", "../a.txt"), /not a repository-relative path/);
  const route = blobRoute(spawnRunner, () => revs);
  assert.equal(await route(new URLSearchParams({ rev: "head", path: "a.txt" })), "two\n");
  await assert.rejects(route(new URLSearchParams({ rev: "UP", path: "a.txt" })), /blob needs rev=/);
});
