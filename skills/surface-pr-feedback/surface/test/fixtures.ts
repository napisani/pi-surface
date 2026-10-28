import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AnalysisInput } from "../state.ts";

const ENV = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", env: ENV }).trim();

// Commits made by the controller under test need an identity too.
Object.assign(process.env, { GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" });

export function write(root: string, path: string, text: string) {
  mkdirSync(join(root, path, ".."), { recursive: true });
  writeFileSync(join(root, path), text);
}

/**
 * A clone with a base commit on main and the PR commit on a feature branch
 * that tracks a bare origin, so commits and pushes run for real.
 */
export function makeRepo() {
  const origin = mkdtempSync(join(tmpdir(), "pr-feedback-origin-"));
  git(origin, "init", "-q", "--bare", "-b", "main");
  const root = mkdtempSync(join(tmpdir(), "pr-feedback-repo-"));
  git(root, "init", "-q", "-b", "main");
  git(root, "remote", "add", "origin", origin);
  write(root, "src/auth.ts", ["export function check(token: string, expected: string) {", "  if (!token) return false;", "  return token === expected;", "}", ""].join("\n"));
  write(root, "docs/auth.md", "# Auth\n\nTokens are compared.\n");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "base");
  const baseSha = git(root, "rev-parse", "HEAD");
  git(root, "push", "-q", "origin", "main");
  git(root, "checkout", "-q", "-b", "feature");
  write(root, "src/auth.ts", ["export function check(token: string, expected: string) {", "  if (!token) return false;", "  const ok = token == expected;", "  log(ok);", "  return ok;", "}", ""].join("\n"));
  write(root, "src/auth.test.ts", "test('check', () => {});\n");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "loosen check");
  git(root, "push", "-q", "-u", "origin", "feature");
  const headSha = git(root, "rev-parse", "HEAD");
  return { root, origin, baseSha, headSha };
}

export function gitIn(root: string, ...args: string[]) {
  return git(root, ...args);
}

const HUNK = "@@ -1,4 +1,6 @@\n export function check(token: string, expected: string) {\n   if (!token) return false;\n-  return token === expected;\n+  const ok = token == expected;";

/** The PR's review comments, reviews and conversation comments as GitHub's REST API returns them. */
export function remoteFeedback() {
  const user = (login: string, type = "User") => ({ login, type });
  return {
    comments: [
      { id: 11, path: "src/auth.ts", line: 3, side: "RIGHT", body: "Use `===` here; `==` coerces.", user: user("alice"), html_url: "https://github.com/acme/widgets/pull/42#discussion_r11", created_at: "2026-10-20T10:00:00Z", diff_hunk: HUNK },
      { id: 12, in_reply_to_id: 11, path: "src/auth.ts", line: 3, side: "RIGHT", body: "Good catch, I'll switch it back to ===.", user: user("me"), html_url: "u12", created_at: "2026-10-20T10:01:00Z" },
      { id: 21, path: "src/auth.ts", line: null, original_line: 4, side: "RIGHT", body: "Where is log defined?", user: user("bob"), html_url: "u21", created_at: "2026-10-20T10:05:00Z", diff_hunk: HUNK },
      { id: 31, path: "src/auth.ts", line: 2, side: "RIGHT", body: "Note to self.", user: user("me"), html_url: "u31", created_at: "2026-10-20T10:06:00Z" },
    ],
    reviews: [
      { id: 501, body: "Please add a test for the empty token.", state: "CHANGES_REQUESTED", user: user("bob"), html_url: "u501", submitted_at: "2026-10-20T10:10:00Z" },
      { id: 502, body: "", state: "APPROVED", user: user("alice"), html_url: "u502", submitted_at: "2026-10-20T10:11:00Z" },
      { id: 503, body: "Self review.", state: "COMMENTED", user: user("me"), html_url: "u503", submitted_at: "2026-10-20T10:12:00Z" },
    ],
    issueComments: [
      { id: 601, body: "Could the docs mention the loose compare?\nIt surprised me.", user: user("carol"), html_url: "u601", created_at: "2026-10-20T10:20:00Z" },
      { id: 602, body: "Coverage: 80%", user: user("ci-bot", "Bot"), html_url: "u602", created_at: "2026-10-20T10:30:00Z" },
      { id: 603, body: "Pushed fixes.", user: user("me"), html_url: "u603", created_at: "2026-10-20T10:40:00Z" },
    ],
    threads: [
      { id: "T11", isResolved: false, isOutdated: false, rootId: 11 },
      { id: "T21", isResolved: false, isOutdated: true, rootId: 21 },
      { id: "T31", isResolved: false, isOutdated: false, rootId: 31 },
    ],
  };
}

export type Remote = ReturnType<typeof remoteFeedback>;

/**
 * Puts a fake `gh` first on PATH. It answers `pr view`, `api user`, the three
 * feedback lists and the thread query from `remote`, and logs every write
 * (replies, comments, resolves) instead of reaching GitHub. Edit
 * `remote.json` in its directory to change what later calls return.
 */
export function fakeGh(repo: { baseSha: string; headSha: string }, remote: Remote = remoteFeedback()) {
  const dir = mkdtempSync(join(tmpdir(), "pr-feedback-gh-"));
  const log = join(dir, "writes.jsonl");
  const data = join(dir, "remote.json");
  writeFileSync(data, JSON.stringify(remote));
  const pr = {
    number: 42,
    title: "Loosen token check",
    url: "https://github.com/acme/widgets/pull/42",
    body: "Makes check lenient.",
    author: { login: "me" },
    baseRefName: "main",
    headRefName: "feature",
    baseRefOid: repo.baseSha,
    headRefOid: repo.headSha,
    isDraft: false,
    state: "OPEN",
  };
  const script = `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
const remote = JSON.parse(fs.readFileSync(${JSON.stringify(data)}, "utf8"));
const record = (entry) => fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(entry) + "\\n");
const lines = (rows) => { for (const r of rows) console.log(JSON.stringify(r)); process.exit(0); };
if (args[0] === "pr" && args[1] === "view") { process.stdout.write(JSON.stringify(${JSON.stringify(pr)})); process.exit(0); }
if (args[0] === "api" && args[1] === "user") { console.log("me"); process.exit(0); }
if (args[0] === "api" && args[1] === "graphql") {
  const query = args[args.indexOf("-f") + 1];
  if (query.includes("resolveReviewThread")) {
    const id = args.find((a) => a.startsWith("id=")).slice(3);
    if (id === "TFAIL") { process.stderr.write("GraphQL: resource not accessible"); process.exit(1); }
    record({ kind: "resolve", id });
    process.stdout.write('{"data":{"resolveReviewThread":{"thread":{"isResolved":true}}}}');
    process.exit(0);
  }
  lines(remote.threads);
}
if (args[0] === "api" && args.includes("POST")) {
  const body = JSON.parse(fs.readFileSync(0, "utf8"));
  const endpoint = args[args.indexOf("POST") + 1];
  if (body.body.includes("FAIL")) { process.stderr.write("HTTP 422: Validation Failed"); process.exit(1); }
  record({ kind: "post", endpoint, body });
  const id = 900 + fs.readFileSync(${JSON.stringify(log)}, "utf8").trim().split("\\n").length;
  process.stdout.write(JSON.stringify({ id, body: body.body, html_url: "https://github.com/acme/widgets/pull/42#c" + id }));
  process.exit(0);
}
if (args[0] === "api" && args[1] === "--paginate") {
  const endpoint = args[2];
  if (endpoint.endsWith("/pulls/42/comments")) lines(remote.comments);
  if (endpoint.endsWith("/pulls/42/reviews")) lines(remote.reviews);
  if (endpoint.endsWith("/issues/42/comments")) lines(remote.issueComments);
}
process.stderr.write("fake gh: unexpected " + args.join(" ")); process.exit(2);
`;
  writeFileSync(join(dir, "gh"), script);
  chmodSync(join(dir, "gh"), 0o755);
  const previous = process.env.PATH;
  process.env.PATH = `${dir}:${previous}`;
  return {
    writes: (): { kind: "post" | "resolve"; endpoint?: string; body?: { body: string }; id?: string }[] => {
      try {
        return readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
      } catch {
        return [];
      }
    },
    setRemote: (next: Remote) => writeFileSync(data, JSON.stringify(next)),
    restore: () => (process.env.PATH = previous),
  };
}

export function analysis(itemId: string, overrides: Partial<AnalysisInput> = {}): AnalysisInput {
  return {
    itemId,
    meaning: "The reviewer wants the strict compare back.",
    recommendation: "fix",
    rationale: "Loose equality lets '1' match 1.",
    risk: "Low",
    importance: "High",
    rework: "Low",
    promised: false,
    nextStep: "Switch == back to ===.",
    refs: [{ path: "src/auth.ts", rev: "work", startLine: 3, endLine: 3, note: "The loose compare." }],
    ...overrides,
  };
}
