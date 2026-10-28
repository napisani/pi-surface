// git and gh calls only the feedback workflow makes: loading the checkout,
// listing what reviewers left, replying, resolving, committing and pushing.
import { Type, type Static, type TSchema } from "typebox";
import { decode, type Json } from "../../../src/host/decode.ts";
import { CommandError, run, type Runner } from "../../../src/host/runner.ts";
import { checkPrCommits, checkWorktree, defaultBase, git, hasCommit, isAncestor, readDiff, viewPr } from "../../../src/kit/git.ts";
import type { FeedbackPr, FeedbackSource, IncomingItem, SourceMessage, Target, ThreadAnchor } from "./state.ts";

export interface OpenInput {
  worktree: string;
  /** A PR as gh pr view accepts it; omit for feedback from chat on local work. */
  pr?: string;
  /** Without a PR, the ref whose merge base with HEAD reads as the base. */
  base?: string;
}

export interface Loaded {
  target: Target;
  pr: FeedbackPr | null;
  /** Why the checkout may not match what reviewers saw, for the agent and the page. */
  warning?: string;
}

async function viewFeedbackPr(runner: Runner, worktree: string, ref: string): Promise<FeedbackPr> {
  const pr = await viewPr(runner, worktree, ref);
  const viewer = (await run(runner, worktree, "gh", ["api", "user", "--jq", ".login"])).trim();
  return { ...pr, viewer };
}

/**
 * Resolves the checkout the page works in. With a PR, the PR's head and base
 * commits must be present locally, since the page reads code at both.
 */
export async function loadTarget(runner: Runner, input: OpenInput, now: string, revision: number): Promise<Loaded> {
  const worktree = input.worktree;
  checkWorktree(worktree);
  const head = (await git(runner, worktree, "rev-parse", "HEAD")).trim();
  const branch = (await git(runner, worktree, "branch", "--show-current")).trim();
  if (!input.pr) {
    const baseRef = input.base ?? (await defaultBase(runner, worktree));
    if (!(await hasCommit(runner, worktree, baseRef))) {
      throw new CommandError(`base "${baseRef}" is not a commit in ${worktree}`);
    }
    const mergeBase = (await git(runner, worktree, "merge-base", baseRef, "HEAD")).trim();
    return {
      pr: null,
      target: { worktree, baseRef, mergeBase, head, branch, title: branch ? `${branch}: local work` : "Local work", since: head, revision, loadedAt: now },
    };
  }

  const pr = await viewFeedbackPr(runner, worktree, input.pr);
  await checkPrCommits(runner, worktree, pr);
  const mergeBase = (await git(runner, worktree, "merge-base", pr.baseSha, "HEAD")).trim();
  let warning: string | undefined;
  if (branch !== pr.headRef) {
    warning = `the checkout is on ${branch || "a detached HEAD"}, not the PR branch ${pr.headRef}`;
  } else if (!(await isAncestor(runner, worktree, pr.headSha, head))) {
    warning = `the checkout does not contain the PR head ${pr.headSha.slice(0, 8)}; pull before fixing so commits land on top of it`;
  }
  return { pr, warning, target: { worktree, baseRef: pr.baseRef, mergeBase, head, branch, title: pr.title, since: pr.headSha, revision, loadedAt: now } };
}

/** The working tree against the commit the page opened at, untracked files included. */
export function feedbackDiff(runner: Runner, target: Target): Promise<string> {
  return readDiff(runner, target.worktree, target.since);
}

// The fields this page reads from GitHub's JSON; everything else is ignored.
const GhUser = Type.Union([Type.Object({ login: Type.Optional(Type.String()), type: Type.Optional(Type.String()) }), Type.Null()]);
const NullableLine = Type.Optional(Type.Union([Type.Integer(), Type.Null()]));

const GhReviewComment = Type.Object({
  id: Type.Integer(),
  in_reply_to_id: Type.Optional(Type.Integer()),
  path: Type.String(),
  line: NullableLine,
  start_line: NullableLine,
  original_line: NullableLine,
  side: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  body: Type.Optional(Type.String()),
  user: Type.Optional(GhUser),
  html_url: Type.Optional(Type.String()),
  created_at: Type.Optional(Type.String()),
  diff_hunk: Type.Optional(Type.String()),
});
type GhReviewComment = Static<typeof GhReviewComment>;

const GhReview = Type.Object({
  id: Type.Integer(),
  body: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  state: Type.Optional(Type.String()),
  user: Type.Optional(GhUser),
  html_url: Type.Optional(Type.String()),
  submitted_at: Type.Optional(Type.Union([Type.String(), Type.Null()])),
});

const GhIssueComment = Type.Object({
  id: Type.Integer(),
  body: Type.Optional(Type.String()),
  user: Type.Optional(GhUser),
  html_url: Type.Optional(Type.String()),
  created_at: Type.Optional(Type.String()),
});

const GhThread = Type.Object({ id: Type.String(), isResolved: Type.Boolean(), isOutdated: Type.Boolean(), rootId: Type.Union([Type.Integer(), Type.Null()]) });

const GhPosted = Type.Object({ id: Type.Integer(), html_url: Type.Optional(Type.String()) });

/** Decodes gh output that holds one JSON object per line. */
function decodeLines<T extends TSchema>(out: string, schema: T, what: string): Static<T>[] {
  return out
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      const json: Json = JSON.parse(line);
      return decode(schema, json, what);
    });
}

async function ghList<T extends TSchema>(runner: Runner, cwd: string, endpoint: string, schema: T): Promise<Static<T>[]> {
  // --jq '.[]' flattens every page into one JSON object per line.
  return decodeLines(await run(runner, cwd, "gh", ["api", "--paginate", endpoint, "--jq", ".[]"]), schema, endpoint);
}

const THREADS_QUERY = `query($owner: String!, $name: String!, $number: Int!, $endCursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100, after: $endCursor) {
        pageInfo { hasNextPage endCursor }
        nodes { id isResolved isOutdated comments(first: 1) { nodes { databaseId } } }
      }
    }
  }
}`;

async function listThreads(runner: Runner, cwd: string, pr: FeedbackPr): Promise<Static<typeof GhThread>[]> {
  const out = await run(runner, cwd, "gh", [
    "api", "graphql", "--paginate",
    "-f", `query=${THREADS_QUERY}`,
    // -f keeps owner and name strings even when they look like numbers.
    "-f", `owner=${pr.owner}`, "-f", `name=${pr.repo}`, "-F", `number=${pr.number}`,
    "--jq", ".data.repository.pullRequest.reviewThreads.nodes[] | {id, isResolved, isOutdated, rootId: .comments.nodes[0].databaseId}",
  ]);
  return decodeLines(out, GhThread, "review threads");
}

type User = Static<typeof GhUser> | undefined;

/** One feedback message, as the page shows it under its item. */
function sourceMessage(user: User, body: string | null | undefined, createdAt: string | null | undefined, url: string | undefined, viewer: string): SourceMessage {
  const message: SourceMessage = { author: user?.login ?? "", body: body ?? "", createdAt: createdAt ?? "", mine: (user?.login ?? "") === viewer };
  if (url) {
    message.url = url;
  }
  return message;
}

/** An item, with its URL when GitHub gave one. */
function incoming(item: IncomingItem, url: string | undefined): IncomingItem {
  if (url) {
    item.url = url;
  }
  return item;
}

/** One item per review thread the viewer did not write alone, its replies in time order. */
function threadItems(comments: GhReviewComment[], threads: Static<typeof GhThread>[], viewer: string): IncomingItem[] {
  const byId = new Map(comments.map((c) => [c.id, c]));
  const rootOf = (c: GhReviewComment) => {
    let current = c;
    for (let hops = 0; current.in_reply_to_id && byId.has(current.in_reply_to_id) && hops < 100; hops++) {
      current = byId.get(current.in_reply_to_id)!;
    }
    return current;
  };
  const groups = new Map<number, GhReviewComment[]>();
  for (const c of comments) {
    const root = rootOf(c);
    groups.set(root.id, [...(groups.get(root.id) ?? []), c]);
  }
  const threadByRoot = new Map(threads.flatMap((t) => (t.rootId === null ? [] : [[t.rootId, t] as const])));
  const items: IncomingItem[] = [];
  for (const [rootId, group] of groups) {
    if (group.every((c) => (c.user?.login ?? "") === viewer)) {
      continue;
    }
    group.sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
    const root = byId.get(rootId)!;
    const thread = threadByRoot.get(rootId);
    const source: FeedbackSource = { kind: "thread", rootId, resolved: thread?.isResolved ?? false, outdated: thread?.isOutdated ?? (root.line ?? null) === null };
    if (thread) {
      source.threadId = thread.id;
    }
    const anchor: ThreadAnchor = { path: root.path, side: root.side === "LEFT" ? "LEFT" : "RIGHT", line: root.line ?? null };
    if (root.start_line) {
      anchor.startLine = root.start_line;
    }
    if (root.original_line) {
      anchor.originalLine = root.original_line;
    }
    if (root.diff_hunk) {
      anchor.diffHunk = root.diff_hunk;
    }
    const messages = group.map((c) => sourceMessage(c.user, c.body, c.created_at, c.html_url, viewer));
    items.push(incoming({ source, author: root.user?.login ?? "", anchor, messages, createdAt: root.created_at ?? "" }, root.html_url));
  }
  return items;
}

/**
 * Everything reviewers left on the PR, one item per review thread, review
 * summary and conversation comment. Feedback written only by the viewer is
 * left out, and bots' conversation comments come in hidden.
 */
export async function listFeedback(runner: Runner, target: Target, pr: FeedbackPr): Promise<IncomingItem[]> {
  const base = `repos/${pr.owner}/${pr.repo}`;
  const [comments, reviews, conversation, threads] = await Promise.all([
    ghList(runner, target.worktree, `${base}/pulls/${pr.number}/comments`, GhReviewComment),
    ghList(runner, target.worktree, `${base}/pulls/${pr.number}/reviews`, GhReview),
    ghList(runner, target.worktree, `${base}/issues/${pr.number}/comments`, GhIssueComment),
    listThreads(runner, target.worktree, pr),
  ]);
  const others = (user: User, body: string | null | undefined) => Boolean(body?.trim()) && (user?.login ?? "") !== pr.viewer;
  const items = threadItems(comments, threads, pr.viewer);
  for (const r of reviews.filter((r) => others(r.user, r.body))) {
    const messages = [sourceMessage(r.user, r.body, r.submitted_at, r.html_url, pr.viewer)];
    items.push(incoming({ source: { kind: "review", reviewId: r.id, state: r.state ?? "COMMENTED" }, author: r.user?.login ?? "", messages, createdAt: r.submitted_at ?? "" }, r.html_url));
  }
  for (const c of conversation.filter((c) => others(c.user, c.body))) {
    const messages = [sourceMessage(c.user, c.body, c.created_at, c.html_url, pr.viewer)];
    const item: IncomingItem = { source: { kind: "conversation", commentId: c.id }, author: c.user?.login ?? "", messages, createdAt: c.created_at ?? "", hidden: c.user?.type === "Bot" };
    items.push(incoming(item, c.html_url));
  }
  return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Where a reply goes: into the review thread, or the PR conversation for anything else. */
/** What a reply answers: a review thread by its root comment, or the PR conversation. */
export interface ReplySource {
  kind: string;
  rootId?: number;
}

export function replyEndpoint(pr: FeedbackPr, source: ReplySource): string {
  const base = `repos/${pr.owner}/${pr.repo}`;
  return source.kind === "thread" ? `${base}/pulls/${pr.number}/comments/${source.rootId}/replies` : `${base}/issues/${pr.number}/comments`;
}

/** Posts one reply to GitHub; with resolveReviewThread below, the only calls that write to GitHub. */
/** A reply GitHub accepted: its id and where it lives. */
export interface PostedReply {
  githubId: number;
  url: string;
}

export async function postReply(runner: Runner, target: Target, pr: FeedbackPr, source: ReplySource, body: string): Promise<PostedReply> {
  const out = await run(runner, target.worktree, "gh", ["api", "-X", "POST", replyEndpoint(pr, source), "--input", "-"], JSON.stringify({ body }));
  const json: Json = JSON.parse(out);
  const posted = decode(GhPosted, json, "GitHub reply");
  return { githubId: posted.id, url: posted.html_url ?? "" };
}

const RESOLVE_MUTATION = "mutation($id: ID!) { resolveReviewThread(input: { threadId: $id }) { thread { isResolved } } }";

export async function resolveReviewThread(runner: Runner, target: Target, threadId: string): Promise<void> {
  await run(runner, target.worktree, "gh", ["api", "graphql", "-f", `query=${RESOLVE_MUTATION}`, "-f", `id=${threadId}`]);
}

/**
 * Commits exactly the given paths with the message, leaving anything else
 * staged or modified alone. Returns the new commit's sha.
 */
export async function commitPaths(runner: Runner, target: Target, message: string, paths: string[]): Promise<string> {
  await git(runner, target.worktree, "add", "-A", "--", ...paths);
  await run(runner, target.worktree, "git", ["commit", "-q", "-F", "-", "--", ...paths], message);
  return (await git(runner, target.worktree, "rev-parse", "HEAD")).trim();
}

export async function push(runner: Runner, target: Target): Promise<void> {
  await git(runner, target.worktree, "push", "--quiet");
}

/** The shas among `shas` that the given ref contains. */
export async function containedIn(runner: Runner, target: Target, shas: string[], ref: string): Promise<Set<string>> {
  const contained = await Promise.all(shas.map(async (sha) => ((await isAncestor(runner, target.worktree, sha, ref)) ? [sha] : [])));
  return new Set(contained.flat());
}
