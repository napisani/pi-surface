import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { runWorkflow } from "../../../../test/harness.ts";
import type { FeedbackSession } from "../session.ts";
import feedbackWorkflow from "../workflow.ts";
import { analysis, fakeGh, gitIn, makeRepo, remoteFeedback, write } from "./fixtures.ts";

let gh: ReturnType<typeof fakeGh>;
let repo: ReturnType<typeof makeRepo>;
before(() => {
  repo = makeRepo();
  gh = fakeGh(repo);
});
after(() => gh.restore());

function harness() {
  const h = runWorkflow(feedbackWorkflow);
  return { ...h, feedback: h.session };
}

const open = (feedback: FeedbackSession) => feedback.open({ worktree: repo.root, pr: "42" });

test("opening a PR turns threads, review summaries and PR comments into items and starts triage", async () => {
  const { feedback, close } = harness();
  try {
    const opened = await open(feedback);
    const { items, triage, target, pr } = feedback.state;
    assert.equal(pr?.viewer, "me");
    assert.equal(target?.since, repo.headSha);
    assert.deepEqual(
      items.map((i) => [i.id, i.source.kind, i.author, i.hidden]),
      [
        ["PF-1", "thread", "alice", false],
        ["PF-2", "thread", "bob", false],
        ["PF-3", "review", "bob", false],
        ["PF-4", "conversation", "carol", false],
        ["PF-5", "conversation", "ci-bot", true],
      ],
      "threads only the viewer wrote, empty reviews and the viewer's comments are not feedback",
    );
    assert.deepEqual(items[0].messages.map((m) => [m.author, m.mine]), [["alice", false], ["me", true]]);
    assert.deepEqual(items[0].source, { kind: "thread", rootId: 11, threadId: "T11", resolved: false, outdated: false });
    assert.equal(items[1].anchor?.line, null);
    assert.match(items[0].anchor?.diffHunk ?? "", /token == expected/);
    assert.equal(triage.status, "running");
    assert.match(opened.triage ?? "", /- PF-1 · review thread on src\/auth\.ts:3 \(PR head\) · @alice\n  @alice:\n    Use `===` here/);
    assert.match(opened.triage ?? "", /@me \(you\):\n    Good catch/);
    assert.doesNotMatch(opened.triage ?? "", /PF-5/, "hidden items are not triaged");
  } finally {
    await close();
  }
});

test("triage records analyses, queues promised fixes, and rejects a bad batch whole", async () => {
  const { feedback, close, replay } = harness();
  try {
    await open(feedback);
    // SAFETY: an unknown level on purpose; postAnalyses must reject it.
    assert.throws(
      () => feedback.postAnalyses([analysis("PF-1", { risk: "Huge" as never }), analysis("PF-9")], true),
      /analysis 1 \(PF-1\): risk must be Low, Medium or High[\s\S]*unknown feedback item "PF-9"/,
    );
    assert.equal(feedback.state.items[0].analysis, undefined);

    feedback.postAnalyses([analysis("PF-1", { promised: true, promisedFix: "Switch back to ===." })], false);
    assert.equal(feedback.state.triage.status, "running");
    const first = feedback.state.items[0];
    assert.equal(first.decision, "fix");
    assert.deepEqual([first.fix?.status, first.fix?.messages[0].text], ["pending", "Switch back to ===."]);

    feedback.postAnalyses([analysis("PF-2", { recommendation: "respond" }), analysis("PF-3"), analysis("PF-4", { recommendation: "skip" })], true);
    assert.equal(feedback.state.triage.status, "done");
    assert.equal(feedback.state.items[1].decision, "undecided", "only promised fixes are queued for the user");
    assert.deepEqual(replay(), feedback.state);
  } finally {
    await close();
  }
});

test("fixes go to the agent in batches with the reviewer's words, and outcomes come back per item", async () => {
  const { feedback, messages, close, replay } = harness();
  try {
    await open(feedback);
    feedback.postAnalyses([analysis("PF-1", { promised: true }), analysis("PF-3", { nextStep: "Add an empty-token test." })], true);
    await feedback.handleAction({ type: "item.decide", itemId: "PF-3", decision: "fix" });
    assert.equal(feedback.state.items[2].fix?.messages[0].text, "Add an empty-token test.", "the analysis' next step is the default instruction");
    await feedback.handleAction({ type: "fix.edit", itemId: "PF-3", text: "Add a test that an empty token fails." });

    await feedback.handleAction({ type: "fixes.send" });
    const sent = messages.at(-1)!.content;
    assert.match(sent, /^fixes, round 1/);
    assert.match(sent, /- PF-3 · review summary · @bob · changes requested\n  @bob:\n    Please add a test for the empty token\.[\s\S]*user: Add a test that an empty token fails\./);
    await assert.rejects(feedback.handleAction({ type: "item.decide", itemId: "PF-3", decision: "skip" }), /recall the batch/);
    await assert.rejects(feedback.handleAction({ type: "fixes.send" }), /still working on the last batch/);

    write(repo.root, "src/auth.ts", readFileSync(join(repo.root, "src/auth.ts"), "utf8").replace("token == expected", "token === expected"));
    await assert.rejects(feedback.updateFixes([{ itemId: "PF-2", status: "done", reply: "x" }]), /PF-2: no fix was sent/);
    await feedback.updateFixes([
      { itemId: "PF-1", status: "done", reply: "Back to ===.", files: ["src/auth.ts"] },
      { itemId: "PF-3", status: "needs-input", reply: "Which file should the test go in?" },
    ]);
    const state = feedback.state;
    assert.deepEqual(state.files.map((f) => f.path), ["src/auth.ts"], "the Changes diff shows the fix against the PR head");
    assert.deepEqual([state.items[0].fix?.status, state.items[0].fix?.files], ["done", ["src/auth.ts"]]);
    await feedback.handleAction({ type: "fix.followUp", itemId: "PF-3", text: "src/auth.test.ts" });
    assert.equal(feedback.state.items[2].fix?.status, "pending");
    await feedback.handleAction({ type: "fixes.send" });
    assert.match(messages.at(-1)!.content, /round 2[\s\S]*you: Which file[\s\S]*user: src\/auth\.test\.ts/);
    await feedback.handleAction({ type: "fixes.recall" });
    assert.equal(feedback.state.items[2].fix?.status, "pending");
    assert.deepEqual(replay(), feedback.state);
  } finally {
    gitIn(repo.root, "checkout", "--", "src/auth.ts");
    await close();
  }
});

test("commits run only on the user's click, replies wait for the push, and only posts reach GitHub", async () => {
  const { feedback, messages, close } = harness();
  try {
    await open(feedback);
    feedback.postAnalyses([analysis("PF-1", { promised: true })], true);
    await feedback.handleAction({ type: "fixes.send" });
    write(repo.root, "src/auth.ts", readFileSync(join(repo.root, "src/auth.ts"), "utf8").replace("token == expected", "token === expected"));
    write(repo.root, "docs/auth.md", "# Auth\n\nUnrelated local edit.\n");
    await feedback.updateFixes([{ itemId: "PF-1", status: "done", reply: "Back to ===.", files: ["src/auth.ts"] }]);

    await feedback.handleAction({ type: "commits.propose" });
    assert.match(messages.at(-1)!.content, /Fixed items not yet committed:\n- PF-1 [^\n]* · files src\/auth\.ts/);
    assert.equal(feedback.state.proposing.status, "running");
    feedback.proposeCommits([{ message: "Compare tokens strictly", items: ["PF-1"], paths: ["src/auth.ts"] }]);
    assert.deepEqual(feedback.state.commits.map((c) => [c.id, c.status]), [["K1", "proposed"]]);
    assert.equal(gitIn(repo.root, "rev-parse", "HEAD"), repo.headSha, "proposing never commits");

    await feedback.handleAction({ type: "reply.edit", itemId: "PF-1", body: "Switched back to ===." });
    await feedback.handleAction({ type: "commit.run", commitId: "K1" });
    await feedback.idle;
    const commit = feedback.state.commits[0];
    assert.equal(commit.status, "committed");
    assert.equal(gitIn(repo.root, "log", "-1", "--format=%s"), "Compare tokens strictly");
    assert.equal(gitIn(repo.root, "status", "--porcelain"), "M docs/auth.md", "only the plan's paths are committed");
    await assert.rejects(feedback.handleAction({ type: "reply.post", itemId: "PF-1" }), /not on GitHub yet; push before replying/);

    await feedback.handleAction({ type: "push" });
    await feedback.idle;
    assert.equal(feedback.state.push.status, "idle");
    assert.equal(feedback.state.commits[0].pushed, true);
    assert.equal(gitIn(repo.origin, "rev-parse", "feature"), commit.sha);

    assert.equal(gh.writes().length, 0, "nothing reached GitHub before a post click");
    await feedback.handleAction({ type: "reply.post", itemId: "PF-1", resolve: true });
    await feedback.idle;
    const item = feedback.state.items[0];
    assert.equal(item.reply?.status, "posted");
    assert.equal(item.source.kind === "thread" && item.source.resolved, true);
    assert.deepEqual(gh.writes().map((w) => [w.kind, w.endpoint ?? w.id]), [["post", "repos/acme/widgets/pulls/42/comments/11/replies"], ["resolve", "T11"]]);
    await assert.rejects(feedback.handleAction({ type: "reply.edit", itemId: "PF-1", body: "x" }), /already posted/);
  } finally {
    gitIn(repo.root, "checkout", "--", "docs/auth.md");
    await close();
  }
});

test("replies to summaries and PR comments quote them; a refused post can be fixed and retried", async () => {
  const { feedback, close } = harness();
  try {
    await open(feedback);
    const before = gh.writes().length;
    await feedback.handleAction({ type: "reply.edit", itemId: "PF-4", body: "FAIL Added a line to docs/auth.md." });
    await feedback.handleAction({ type: "reply.post", itemId: "PF-4" });
    await feedback.idle;
    assert.equal(feedback.state.items[3].reply?.status, "failed");
    assert.match(feedback.state.items[3].reply?.error ?? "", /422/);

    await feedback.handleAction({ type: "reply.edit", itemId: "PF-4", body: "Added a line to docs/auth.md." });
    assert.equal(feedback.state.items[3].reply?.status, "draft");
    await feedback.handleAction({ type: "reply.post", itemId: "PF-4" });
    await feedback.idle;
    const post = gh.writes().slice(before).at(-1)!;
    assert.equal(post.endpoint, "repos/acme/widgets/issues/42/comments");
    assert.equal(post.body?.body, "@carol\n> Could the docs mention the loose compare?\n> It surprised me.\n\nAdded a line to docs/auth.md.");
    await assert.rejects(feedback.handleAction({ type: "thread.resolve", itemId: "PF-4" }), /not a review thread/);
  } finally {
    await close();
  }
});

test("questions, reply assists and auto-drafts wake the agent; its tools fill the page", async () => {
  const { feedback, messages, close, replay } = harness();
  try {
    await open(feedback);
    feedback.postAnalyses([analysis("PF-2", { recommendation: "respond", meaning: "Bob cannot find where log comes from." })], true);
    await feedback.handleAction({ type: "item.ask", itemId: "PF-2", text: "Is log a global?" });
    assert.match(messages.at(-1)!.content, /question about PF-2[\s\S]*outdated[\s\S]*your triage: respond · R\/I\/W L\/H\/L · Bob cannot find[\s\S]*Question: Is log a global\?/);
    feedback.answer("PF-2", "No; nothing defines it.", [{ kind: "callTree", label: "Calls", text: "check\n  log (undefined)" }]);
    assert.equal(feedback.state.items[1].discussion.length, 2);
    assert.equal(feedback.state.items[1].discussionVisuals.length, 1);

    await feedback.handleAction({ type: "replies.autoDraft", itemIds: ["PF-2", "PF-3"], instruction: "keep it short" });
    assert.deepEqual(feedback.state.items.slice(1, 3).map((i) => i.reply?.assisting), [true, true]);
    assert.match(messages.at(-1)!.content, /draft replies for 2 items[\s\S]*decision: undecided[\s\S]*Instruction: keep it short/);
    await assert.rejects(feedback.handleAction({ type: "reply.post", itemId: "PF-2" }), /reply is empty|still writing/);
    feedback.draftReply("PF-2", "It's imported in the next commit.", "kept it to one line");
    assert.deepEqual([feedback.state.items[1].reply?.assisting, feedback.state.items[1].reply?.agentNote], [false, "kept it to one line"]);

    await feedback.handleAction({ type: "reply.assist", itemId: "PF-2", instruction: "Name the file" });
    assert.match(messages.at(-1)!.content, /reply assist · PF-2[\s\S]*Request: Name the file\nCurrent draft:\n> It's imported/);
    await feedback.handleAction({ type: "reply.stopAssist", itemId: "PF-3" });
    assert.equal(feedback.state.items[2].reply?.assisting, false);
    assert.deepEqual(replay(), feedback.state);
  } finally {
    await close();
  }
});

test("reopening keeps decisions and replies, adds new feedback, and keeps the Changes base", async () => {
  const { feedback, close } = harness();
  try {
    await open(feedback);
    await feedback.handleAction({ type: "item.decide", itemId: "PF-4", decision: "respond" });
    await feedback.handleAction({ type: "reply.edit", itemId: "PF-4", body: "Will do." });
    const next = remoteFeedback();
    next.threads[0].isResolved = true;
    next.issueComments.push({ id: 604, body: "One more thing.", user: { login: "dave", type: "User" }, html_url: "u604", created_at: "2026-10-21T00:00:00Z" });
    gh.setRemote(next);
    await feedback.handleAction({ type: "refresh" });
    const { items, target } = feedback.state;
    assert.deepEqual([items[3].decision, items[3].reply?.body], ["respond", "Will do."]);
    assert.equal(items[0].source.kind === "thread" && items[0].source.resolved, true);
    assert.deepEqual([items.at(-1)?.id, items.at(-1)?.author], ["PF-6", "dave"]);
    assert.equal(target?.since, repo.headSha);
    assert.equal(target?.revision, 2);
  } finally {
    gh.setRemote(remoteFeedback());
    await close();
  }
});

test("feedback from chat works without a PR and is copied, never posted", async () => {
  const { feedback, close } = harness();
  try {
    const opened = await feedback.open({ worktree: repo.root, base: "main" });
    assert.equal(opened.triage, undefined);
    const { ids, triage } = feedback.addChatItemsForTriage([{ body: "Rename ok to matches.", author: "Sam", ref: { path: "src/auth.ts", rev: "work", startLine: 3, endLine: 3 } }]);
    assert.deepEqual(ids, ["PF-1"]);
    assert.match(triage, /- PF-1 · from chat on src\/auth\.ts:3 \(working tree\) · @Sam/);
    assert.throws(() => feedback.addChatItems([{ body: "x", ref: { path: "../etc", rev: "work", startLine: 1, endLine: 1 } }]), /not a repository-relative path/);
    await feedback.handleAction({ type: "reply.edit", itemId: "PF-1", body: "Renamed." });
    await assert.rejects(feedback.handleAction({ type: "reply.post", itemId: "PF-1" }), /posting needs a PR/);
  } finally {
    await close();
  }
});
