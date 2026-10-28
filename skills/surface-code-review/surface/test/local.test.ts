import assert from "node:assert/strict";
import { rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { runWorkflow } from "../../../../test/harness.ts";
import reviewWorkflow from "../workflow.ts";
import { addLocalWork, fakeGh, findingsInput, gitIn, makeRepo } from "./fixtures.ts";

const harness = () => {
  const h = runWorkflow(reviewWorkflow);
  return { ...h, review: h.session };
};

test("a local review compares the merge base with the working tree, untracked files included", async () => {
  const repo = makeRepo();
  addLocalWork(repo.root);
  const { review, close } = harness();
  try {
    await review.open({ worktree: repo.root });
    const { target, pr, files } = review.state;
    assert.equal(pr, null);
    assert.deepEqual([target?.mode, target?.baseRef, target?.mergeBase, target?.branch], ["live", "main", repo.baseSha, "feature"]);
    assert.deepEqual(files.map((f) => [f.path, f.status]).sort(), [
      ["config.yaml", "deleted"],
      ["docs/auth.md", "renamed"],
      ["src/auth.test.ts", "added"],
      ["src/auth.ts", "modified"],
      ["src/limits.ts", "added"],
    ]);
    const diff = await review.readDiff();
    assert.match(diff, /\+  log\('checked'\);[\s\S]*\+export const MAX_TOKEN = 64;/);
    gitIn(repo.root, "config", "diff.mnemonicPrefix", "true");
    await review.handleAction({ type: "refresh" });
    assert.match(await review.readDiff(), /^diff --git a\/config\.yaml b\/config\.yaml$/m, "a/ and b/ prefixes whatever the user's config says");
    assert.match(await review.routes.blob(new URLSearchParams({ rev: "work", path: "src/auth.ts" })), /log\('checked'\)/, "the head side is the working tree");
    symlinkSync("/etc/hosts", join(repo.root, "escape"));
    await assert.rejects(review.routes.blob(new URLSearchParams({ rev: "work", path: "escape" })), /outside the worktree/);
    rmSync(join(repo.root, "escape"));

    await review.open({ worktree: repo.root, base: "HEAD" });
    assert.deepEqual(review.state.files.map((f) => f.path).sort(), ["src/auth.ts", "src/limits.ts"], "base HEAD shows only uncommitted work");
    await assert.rejects(review.handleAction({ type: "comment.create", anchor: { path: "src/auth.ts", side: "RIGHT", line: 5 }, body: "x" }), /need a PR/);
  } finally {
    await close();
  }
});

test("change requests go out as one batch, and the agent's update reloads the diff", async () => {
  const repo = makeRepo();
  addLocalWork(repo.root);
  const { review, messages, replay, close } = harness();
  try {
    await review.open({ worktree: repo.root });
    const before: string | undefined = review.state.files.find((f) => f.path === "src/auth.ts")!.fingerprint;
    await review.handleAction({ type: "request.create", anchor: { path: "src/auth.ts", side: "RIGHT", line: 3 }, body: "use ===" });
    await review.handleAction({ type: "request.create", body: "add a test for empty tokens" });
    await review.handleAction({ type: "request.create", anchor: { path: "src/auth.ts", side: "RIGHT", line: 5 }, body: "drop this" });
    await review.handleAction({ type: "request.delete", requestId: "R3" });
    await review.handleAction({ type: "request.edit", requestId: "R1", body: "use === here" });
    assert.equal(review.state.requests[0].anchorText, "  const ok = token == expected;");
    assert.equal(messages.length, 0, "requests wait for Send");

    await review.handleAction({ type: "requests.send" });
    assert.match(messages[0].content, /^change requests, round 1/);
    assert.match(messages[0].content, /- R1 at src\/auth\.ts:3 \(current code\) · the line read: "const ok = token == expected;"\n  user: use === here/);
    assert.match(messages[0].content, /- R2 at the change as a whole\n  user: add a test for empty tokens/);
    await assert.rejects(review.handleAction({ type: "requests.send" }), /still working on the last batch/);

    // The agent edits the working tree, then reports.
    writeFileSync(join(repo.root, "src/auth.ts"), "export function check(token: string, expected: string) {\n  if (!token) return false;\n  return token === expected;\n}\n");
    await review.updateRequests([
      { requestId: "R1", status: "done", reply: "Back to ===.", anchor: { path: "src/auth.ts", side: "RIGHT", line: 3 } },
      { requestId: "R2", status: "needs-input", reply: "Which test file?" },
    ]);
    const [r1, r2] = review.state.requests;
    assert.deepEqual([r1.status, r2.status], ["done", "needs-input"]);
    assert.equal(review.state.files.find((f) => f.path === "src/auth.ts"), undefined, "the edit took the file back to its base, out of the diff");
    assert.ok(before);
    assert.equal(r1.fingerprint, undefined, "no fingerprint for a file outside the diff");
    assert.equal(review.state.target!.revision, 2);

    await review.handleAction({ type: "request.followUp", requestId: "R2", text: "src/auth.test.ts" });
    await review.handleAction({ type: "requests.send" });
    assert.match(messages[1].content, /round 2[\s\S]*R2 at the change as a whole\n  user: add a test for empty tokens\n  you: Which test file\?\n  user: src\/auth\.test\.ts/);
    assert.doesNotMatch(messages[1].content, /R1/);
    await review.handleAction({ type: "requests.recall" });
    assert.equal(review.state.requests[1].status, "pending");
    assert.deepEqual(replay(), review.state);
  } finally {
    await close();
  }
});

test("findings become pending requests without waking the agent", async () => {
  const repo = makeRepo();
  addLocalWork(repo.root);
  const { review, messages, close } = harness();
  try {
    await review.open({ worktree: repo.root });
    review.postFindings(findingsInput());
    await review.handleAction({ type: "findings.request", findingIds: ["F1", "F2"] });
    const [a, b] = review.state.requests;
    assert.deepEqual(a.anchor, { path: "src/auth.ts", side: "RIGHT", line: 3 });
    assert.match(a.messages[0].text, /^Fix F1: Token compared with loose equality\. Use `===`/);
    assert.equal(b.origin.kind, "finding");
    assert.equal(messages.length, 0);
  } finally {
    await close();
  }
});

let gh: ReturnType<typeof fakeGh>;
const prRepo = makeRepo();
before(() => (gh = fakeGh(prRepo)));
after(() => gh.restore());

test("a live review of a PR posts to GitHub only while the file matches the pushed head", async () => {
  const { review, close } = harness();
  try {
    await review.open({ worktree: prRepo.root, pr: "42", live: true });
    assert.equal(review.state.target?.mode, "live");
    await review.handleAction({ type: "comment.create", anchor: { path: "src/auth.ts", side: "RIGHT", line: 3 }, body: "Posted while clean.", then: "post" });
    await review.idle;
    assert.equal(review.state.comments[0].status, "posted");

    addLocalWork(prRepo.root);
    await review.handleAction({ type: "refresh" });
    await review.handleAction({ type: "comment.create", anchor: { path: "src/auth.ts", side: "RIGHT", line: 3 }, body: "Too early.", then: "post" });
    await review.idle;
    assert.equal(review.state.comments[1].status, "failed");
    assert.match(review.state.comments[1].error ?? "", /local changes that GitHub hasn't seen/);
    await review.handleAction({ type: "request.create", anchor: { path: "src/auth.ts", side: "RIGHT", line: 5 }, body: "requests work too" });
    assert.equal(review.state.requests.length, 1);
    assert.equal(gh.posts().length, 1);
  } finally {
    gitIn(prRepo.root, "checkout", "--", ".");
    await close();
  }
});
