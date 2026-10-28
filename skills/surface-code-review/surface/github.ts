// git and gh calls only the review workflow makes: resolving what to compare,
// reading GitHub's review threads, and posting a comment.
import { Type } from "typebox";
import { decode, type Json } from "../../../src/host/decode.ts";
import { CommandError, run, type Runner } from "../../../src/host/runner.ts";
import type { Side } from "../../../src/kit/code.ts";
import { checkPrCommits, checkWorktree, defaultBase, git, hasCommit, readDiff, viewPr } from "../../../src/kit/git.ts";
import type { DraftComment, RemoteComment, ReviewPr, Target } from "./state.ts";

export interface OpenInput {
  worktree: string;
  /** A PR as gh pr view accepts it; omit for local changes. */
  pr?: string;
  /** Ref to compare against when there is no PR; the merge base with HEAD is used. */
  base?: string;
  /** Read the working tree so change requests work; defaults to true without a PR. */
  live?: boolean;
}

/**
 * Resolves what the page compares. Live reviews read the working tree from the
 * merge base; pinned reviews read one commit and need the worktree checked out at it.
 */
export async function loadTarget(runner: Runner, input: OpenInput, now: string, revision: number): Promise<{ target: Target; pr: ReviewPr | null }> {
  const worktree = input.worktree;
  checkWorktree(worktree);
  const head = (await git(runner, worktree, "rev-parse", "HEAD")).trim();
  const branch = (await git(runner, worktree, "branch", "--show-current")).trim();
  const live = input.live ?? !input.pr;
  if (!input.pr) {
    if (!live) {
      throw new CommandError("a pinned review needs a PR; local reviews are always live");
    }
    const baseRef = input.base ?? (await defaultBase(runner, worktree));
    if (!(await hasCommit(runner, worktree, baseRef))) {
      throw new CommandError(`base "${baseRef}" is not a commit in ${worktree}`);
    }
    const mergeBase = (await git(runner, worktree, "merge-base", baseRef, "HEAD")).trim();
    return {
      pr: null,
      target: { worktree, mode: "live", baseRef, mergeBase, head, branch, title: branch ? `${branch}: local changes` : "Local changes", revision, loadedAt: now },
    };
  }

  const pr = await viewPr(runner, worktree, input.pr);
  await checkPrCommits(runner, worktree, pr);
  // A pinned review reads files from the worktree, so a checkout of any other commit would review the wrong code.
  if (!live && head !== pr.headSha) {
    throw new CommandError(
        `${worktree} is at ${head.slice(0, 12)}, not the PR head ${pr.headSha.slice(0, 12)}. ` +
          `Leave that checkout alone and make a dedicated worktree: git -C ${worktree} fetch origin pull/${pr.number}/head ${pr.baseRef} && ` +
          `git -C ${worktree} worktree add --detach <clone>__worktrees/pr-review-${pr.number} ${pr.headSha}`,
      );
  }
  const mergeBase = (await git(runner, worktree, "merge-base", pr.baseSha, live ? "HEAD" : pr.headSha)).trim();
  return {
    pr,
    target: { worktree, mode: live ? "live" : "pinned", baseRef: pr.baseRef, mergeBase, head: live ? head : pr.headSha, branch, title: pr.title, revision, loadedAt: now },
  };
}

/** The unified diff the page shows; a live review includes uncommitted and untracked files. */
export function reviewDiff(runner: Runner, target: Target): Promise<string> {
  return target.mode === "pinned" ? readDiff(runner, target.worktree, target.mergeBase, target.head) : readDiff(runner, target.worktree, target.mergeBase);
}

/** The PR's current head on GitHub, to spot pushes made after loading. */
export async function remoteHead(runner: Runner, target: Target, pr: ReviewPr): Promise<string> {
  return (await viewPr(runner, target.worktree, String(pr.number))).headSha;
}

// The fields this page reads from GitHub's review-comment JSON; everything else is ignored.
const GhComment = Type.Object({
  id: Type.Integer(),
  in_reply_to_id: Type.Optional(Type.Integer()),
  path: Type.String(),
  line: Type.Optional(Type.Union([Type.Integer(), Type.Null()])),
  start_line: Type.Optional(Type.Union([Type.Integer(), Type.Null()])),
  original_line: Type.Optional(Type.Union([Type.Integer(), Type.Null()])),
  side: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  body: Type.Optional(Type.String()),
  user: Type.Optional(Type.Union([Type.Object({ login: Type.Optional(Type.String()) }), Type.Null()])),
  html_url: Type.Optional(Type.String()),
  created_at: Type.Optional(Type.String()),
});

function toRemote(text: string): RemoteComment {
  const json: Json = JSON.parse(text);
  const c = decode(GhComment, json, "GitHub review comment");
  const remote: RemoteComment = {
    id: c.id,
    path: c.path,
    side: c.side === "LEFT" ? "LEFT" : "RIGHT",
    line: c.line ?? null,
    body: c.body ?? "",
    author: c.user?.login ?? "",
    url: c.html_url ?? "",
    createdAt: c.created_at ?? "",
  };
  if (c.in_reply_to_id) {
    remote.inReplyTo = c.in_reply_to_id;
  }
  if (c.start_line) {
    remote.startLine = c.start_line;
  }
  if (c.original_line) {
    remote.originalLine = c.original_line;
  }
  return remote;
}

export async function listReviewComments(runner: Runner, target: Target, pr: ReviewPr): Promise<RemoteComment[]> {
  // --jq '.[]' flattens every page into one JSON object per line.
  const out = await run(runner, target.worktree, "gh", ["api", "--paginate", `repos/${pr.owner}/${pr.repo}/pulls/${pr.number}/comments`, "--jq", ".[]"]);
  return out
    .split("\n")
    .filter((line) => line.trim())
    .map(toRemote);
}

/** The body GitHub's create-review-comment and reply endpoints take. A reply sends only `body`. */
export interface CommentBody {
  body: string;
  commit_id?: string;
  path?: string;
  side?: Side;
  line?: number;
  start_line?: number;
  start_side?: Side;
}

export interface CommentRequest {
  endpoint: string;
  body: CommentBody;
}

/** The request GitHub's create-review-comment endpoint takes for a draft. */
export function commentRequest(pr: ReviewPr, comment: DraftComment): CommentRequest {
  const base = `repos/${pr.owner}/${pr.repo}/pulls/${pr.number}/comments`;
  if (comment.inReplyTo !== undefined) {
    return { endpoint: `${base}/${comment.inReplyTo}/replies`, body: { body: comment.body } };
  }
  const { path, side, line, startLine } = comment.anchor;
  const body: CommentBody = { body: comment.body, commit_id: pr.headSha, path, side, line };
  if (startLine !== undefined && startLine < line) {
    body.start_line = startLine;
    body.start_side = side;
  }
  return { endpoint: base, body };
}

/**
 * In a live review, line numbers match GitHub's only when the checkout is the
 * pushed PR head and the file has no local edits; refuse otherwise.
 */
async function checkPostable(runner: Runner, target: Target, pr: ReviewPr, path: string): Promise<void> {
  if (target.mode === "pinned") {
    return;
  }
  const head = (await git(runner, target.worktree, "rev-parse", "HEAD")).trim();
  if (head !== pr.headSha) {
    throw new CommandError(`your checkout is at ${head.slice(0, 8)} but the PR head on GitHub is ${pr.headSha.slice(0, 8)}; push (or pull) first so line numbers match`);
  }
  const dirty = (await git(runner, target.worktree, "status", "--porcelain", "--", path)).trim();
  if (dirty) {
    throw new CommandError(`${path} has local changes that GitHub hasn't seen; commit and push first so line numbers match`);
  }
}

/** Posts one review comment to GitHub at once; this is the only call that writes to GitHub. */
export async function postReviewComment(runner: Runner, target: Target, pr: ReviewPr, comment: DraftComment): Promise<RemoteComment> {
  await checkPostable(runner, target, pr, comment.anchor.path);
  const { endpoint, body } = commentRequest(pr, comment);
  const out = await run(runner, target.worktree, "gh", ["api", "-X", "POST", endpoint, "--input", "-"], JSON.stringify(body));
  return toRemote(out);
}
