import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { after, before, test } from "node:test";
import { runWorkflow } from "../../../../test/harness.ts";
import reviewWorkflow from "../workflow.ts";
import { fakeGh, findingsInput, makeRepo } from "./fixtures.ts";

const repo = makeRepo();
let gh: ReturnType<typeof fakeGh>;
before(() => {
  gh = fakeGh(repo, [{ id: 7, path: "src/auth.ts", line: 2, side: "RIGHT", body: "Why?", user: { login: "rev" }, html_url: "u", created_at: "t" }]);
});
after(() => gh.restore());

const PINNED = { worktree: repo.root, pr: "42", live: false };

const harness = () => {
  const h = runWorkflow(reviewWorkflow);
  return { ...h, review: h.session };
};

test("opening a PR reads files from the worktree and threads from GitHub", async () => {
  const { review, close } = harness();
  try {
    await review.open(PINNED);
    const { target, files, remote } = review.state;
    assert.deepEqual([target?.mode, target?.mergeBase, target?.head], ["pinned", repo.baseSha, repo.headSha]);
    assert.deepEqual(
      files.map((f) => [f.path, f.status, f.category]),
      [["config.yaml", "deleted", "config"], ["docs/auth.md", "renamed", "docs"], ["src/auth.test.ts", "added", "test"], ["src/auth.ts", "modified", "impl"]],
    );
    assert.equal(remote[0].author, "rev");
    assert.match(await review.readDiff(), /\+  const ok = token == expected;/);
    assert.match(await review.routes.blob(new URLSearchParams({ rev: "base", path: "src/auth.ts" })), /token === expected/);
    await assert.rejects(review.routes.blob(new URLSearchParams({ rev: "head", path: "../etc/passwd" })), /not a repository-relative path/);
  } finally {
    await close();
  }
});

test("a comment posts to GitHub only when the page asks, and a rejected post can be fixed and retried", async () => {
  const { review, messages, close } = harness();
  try {
    await review.open(PINNED);
    await review.handleAction({ type: "comment.create", anchor: { path: "src/auth.ts", side: "RIGHT", line: 3 }, body: "FAIL please" });
    assert.equal(gh.posts().length, 0, "creating a draft must not reach GitHub");

    await review.handleAction({ type: "comment.post", commentId: "C1" });
    assert.equal(review.state.comments[0].status, "posting");
    await review.idle;
    assert.equal(review.state.comments[0].status, "failed");
    assert.match(review.state.comments[0].error ?? "", /line must be part of the diff/);

    await review.handleAction({ type: "comment.edit", commentId: "C1", body: "Use ===." });
    assert.equal(review.state.comments[0].status, "draft");
    await review.handleAction({ type: "comment.post", commentId: "C1" });
    await review.idle;
    const posted = review.state.comments[0];
    assert.equal(posted.status, "posted");
    assert.equal(gh.posts().at(-1)?.body.commit_id, repo.headSha);
    assert.ok(review.state.remote.some((r) => r.id === posted.githubId), "a posted comment joins the GitHub threads");
    await assert.rejects(review.handleAction({ type: "comment.edit", commentId: "C1", body: "x" }), /already posted/);

    await review.handleAction({ type: "comment.create", anchor: { path: "src/auth.ts", side: "RIGHT", line: 4 }, body: "Posted at once.", then: "post" });
    await review.idle;
    assert.equal(review.state.comments[1].status, "posted");
    assert.equal(gh.posts().length, 3);
    assert.equal(messages.length, 0, "posting never wakes the agent");
  } finally {
    await close();
  }
});

test("a checkout that is not at the PR head is refused", async () => {
  const { review, close } = harness();
  execFileSync("git", ["checkout", "-q", "main"], { cwd: repo.root });
  try {
    await assert.rejects(review.open(PINNED), /not the PR head[\s\S]*worktree add --detach/);
    assert.equal(review.state.pr, null);
  } finally {
    execFileSync("git", ["checkout", "-q", "feature"], { cwd: repo.root });
    await close();
  }
});

test("anchors must land on a side the file has", async () => {
  const { review, close } = harness();
  try {
    await review.open(PINNED);
    const create = (path: string, side: "LEFT" | "RIGHT") => review.handleAction({ type: "comment.create", anchor: { path, side, line: 1 }, body: "" });
    await assert.rejects(create("src/auth.test.ts", "LEFT"), /new in this PR/);
    await assert.rejects(create("config.yaml", "RIGHT"), /deleted in this PR/);
    await assert.rejects(create("src/other.ts", "RIGHT"), /not in this diff/);
  } finally {
    await close();
  }
});

test("review, auto-comment, assist and questions wake the agent; its tools fill the page", async () => {
  const { review, messages, replay, close } = harness();
  try {
    await review.open(PINNED);
    await review.handleAction({ type: "review.run", focus: "auth" });
    assert.equal(review.state.review.status, "running");
    assert.match(messages[0].content, new RegExp(`git diff ${repo.baseSha}\\.\\.\\.${repo.headSha}`));
    assert.match(messages[0].content, /Focus: auth/);

    review.postFindings(findingsInput());
    const { findings, status } = review.state.review;
    assert.equal(status, "done");
    assert.deepEqual(findings.map((f) => f.id), ["F1", "F2"]);

    await review.handleAction({ type: "findings.autoComment", findingIds: ["F1", "F2"] });
    assert.match(messages[1].content, /- F1 \[High\] Token compared with loose equality · src\/auth\.ts:3/);
    const id = review.draftComment({ findingId: "F1", body: "This coerces; use `===`.", note: "kept it short" });
    assert.deepEqual(review.state.comments.find((c) => c.id === id)?.anchor, { path: "src/auth.ts", side: "RIGHT", line: 3 });

    await review.handleAction({ type: "comment.assist", commentId: id, instruction: "add a suggestion block" });
    assert.equal(review.state.comments[0].assisting, true);
    assert.match(messages[2].content, /Drafted from finding:\n- F1/);
    review.draftComment({ commentId: id, body: "```suggestion\n  const ok = token === expected;\n```" });
    assert.equal(review.state.comments[0].assisting, false);

    await review.handleAction({ type: "comment.create", anchor: { path: "src/auth.ts", side: "LEFT", line: 3 }, body: "", then: { assist: "explain why strict was safer" } });
    assert.equal(review.state.comments[1].assisting, true);
    assert.match(messages[3].content, /comment assist · C2 on src\/auth\.ts:3 \(LEFT\)[\s\S]*> \(empty\)/);
    review.draftComment({ commentId: "C2", body: "Strict compare rejected '1' vs 1." });

    await review.handleAction({ type: "finding.ask", findingId: "F2", text: "Is log global?" });
    review.findingReply("F2", "No; nothing defines it.", [{ kind: "callTree", label: "Calls", text: "check\n  log  (undefined)" }]);
    assert.equal(review.state.review.findings[1].thread.length, 2);
    assert.equal(review.state.review.findings[1].visuals.length, 1);

    await review.handleAction({ type: "walkthrough.run" });
    review.postWalkthrough({ title: "Tour", summary: "One stop.", steps: [{ title: "Compare", body: "Loose now.", ref: { path: "src/auth.ts", rev: "head", startLine: 3, endLine: 3 } }] });
    assert.equal(review.state.walkthrough.steps[0].id, "S1");
    assert.equal(messages.length, 6);

    // Persisted op batches alone must rebuild the same document.
    assert.deepEqual(replay(), review.state);
  } finally {
    await close();
  }
});

test("questions about lines or walkthrough steps reach the agent with their thread, and survive a regenerated tour", async () => {
  const { review, messages, replay, close } = harness();
  try {
    await review.open(PINNED);
    const ref = { path: "src/auth.ts", rev: "head" as const, startLine: 3, endLine: 5 };
    await review.handleAction({ type: "question.ask", ref, text: "Why log here?" });
    assert.match(messages[0].content, /^question Q1 about src\/auth\.ts:3-5 \(head\)/);
    review.questionReply("Q1", "To trace failed checks.", [{ kind: "callTree", label: "Calls", text: "check\n  log" }]);
    await review.handleAction({ type: "question.followUp", questionId: "Q1", text: "Is it hot?" });
    assert.match(messages[1].content, /Thread so far:\nuser: Why log here\?\nyou: To trace failed checks\.\nQuestion: Is it hot\?/);
    await review.handleAction({ type: "question.resolve", questionId: "Q1", resolved: true });

    review.postWalkthrough({ title: "Tour", summary: "s", steps: [{ title: "Compare", body: "b", ref }] });
    await review.handleAction({ type: "question.ask", stepId: "S1", text: "What did this replace?" });
    assert.match(messages[2].content, /walkthrough step "Compare"/);
    assert.deepEqual(review.state.questions[1].ref, ref, "a step question points at the step's code");
    review.postWalkthrough({ title: "Tour 2", summary: "s", steps: [{ title: "Other", body: "b", ref }] });
    assert.equal(review.state.questions[1].stepId, undefined);
    assert.equal(review.state.questions[1].stepTitle, "Compare");
    await assert.rejects(review.handleAction({ type: "question.ask", stepId: "S9", text: "?" }), /unknown walkthrough step/);
    assert.deepEqual(replay(), review.state);
  } finally {
    await close();
  }
});

test("invalid findings are rejected whole, naming every problem", async () => {
  const { review, close } = harness();
  try {
    await review.open(PINNED);
    const input = findingsInput();
    // SAFETY: an unknown severity on purpose; postFindings must reject it.
    input.findings[0].severity = "Severe" as never;
    input.findings[1].primary.startLine = 0;
    assert.throws(() => review.postFindings(input), /finding 1: severity[\s\S]*finding 2 primary: lines/);
    assert.equal(review.state.review.findings.length, 0);
  } finally {
    await close();
  }
});

test("a triage must follow the mvr-suggestions rules, and every finding needs every score", async () => {
  const { review, close } = harness();
  try {
    await review.open(PINNED);
    const deferredHigh = findingsInput();
    deferredHigh.findings[0].triage!.bucket = "defer";
    assert.throws(() => review.postFindings(deferredHigh), /finding 1: High findings are always fixed in this diff/);

    const leaky = findingsInput();
    leaky.findings[0].triage!.touches = ["src/auth.ts", "src/other.ts"];
    assert.throws(() => review.postFindings(leaky), /finding 1: fix-now needs a Trivial or Small fix inside the diff's files \(src\/other.ts is outside\)/);

    const overstated = findingsInput();
    overstated.findings[0].triage!.bucket = "fix-now-expands";
    assert.throws(() => review.postFindings(overstated), /finding 1: a Trivial fix inside the diff's files is fix-now/);

    const unscored = findingsInput();
    delete unscored.findings[1].scores!.safety;
    delete unscored.findings[1].triage;
    assert.throws(() => review.postFindings(unscored), /finding 2: needs a triage[\s\S]*finding 2: scores.safety needs a whole value/);

    const renamed = findingsInput();
    renamed.findings[0].triage!.touches = ["docs/old.md"];
    review.postFindings(renamed);
    assert.equal(review.state.review.findings[0].triage?.bucket, "fix-now");
  } finally {
    await close();
  }
});

test("progress notes go only to a running review, and the page can stop one the agent abandoned", async () => {
  const { review, close } = harness();
  try {
    await review.open(PINNED);
    assert.throws(() => review.setTaskStatus("review", "running", "Migration applied locally"), /the review is not running/);
    assert.equal(review.state.review.status, "idle");
    await review.handleAction({ type: "review.run" });
    review.setTaskStatus("review", "running", "lenses running");
    await review.handleAction({ type: "task.stop", task: "review" });
    assert.deepEqual([review.state.review.status, review.state.review.note], ["failed", "Stopped from the page."]);
    await review.handleAction({ type: "review.run" });
    assert.equal(review.state.review.status, "running", "a stopped review can run again");
  } finally {
    await close();
  }
});
