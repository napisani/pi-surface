import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FINDING_DIMENSIONS, type FindingInput } from "../../../../src/kit/findings.ts";
import type { CommentRequest } from "../github.ts";
import type { FindingsInput } from "../state.ts";

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } }).trim();

function write(root: string, path: string, text: string) {
  mkdirSync(join(root, path, ".."), { recursive: true });
  writeFileSync(join(root, path), text);
}

/**
 * A git repo with a base commit on main and a PR commit on top: one modified
 * implementation file, one new test, one renamed doc, one deleted config file.
 */
export function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), "surface-review-repo-"));
  git(root, "init", "-q", "-b", "main");
  write(root, "src/auth.ts", ["export function check(token: string, expected: string) {", "  if (!token) return false;", "  return token === expected;", "}", ""].join("\n"));
  write(root, "docs/old.md", "# Auth\n\nTokens are compared.\n");
  write(root, "config.yaml", "mode: strict\n");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "base");
  const baseSha = git(root, "rev-parse", "HEAD");
  git(root, "checkout", "-q", "-b", "feature");
  write(root, "src/auth.ts", ["export function check(token: string, expected: string) {", "  if (!token) return false;", "  const ok = token == expected;", "  log(ok);", "  return ok;", "}", ""].join("\n"));
  write(root, "src/auth.test.ts", "test('check', () => {});\n");
  git(root, "mv", "docs/old.md", "docs/auth.md");
  git(root, "rm", "-q", "config.yaml");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "loosen check");
  const headSha = git(root, "rev-parse", "HEAD");
  return { root, baseSha, headSha };
}

/** Uncommitted work on top of makeRepo's feature branch: one edited file and one new, untracked file. */
export function addLocalWork(root: string) {
  write(root, "src/auth.ts", ["export function check(token: string, expected: string) {", "  if (!token) return false;", "  const ok = token == expected;", "  log(ok);", "  log('checked');", "  return ok;", "}", ""].join("\n"));
  write(root, "src/limits.ts", "export const MAX_TOKEN = 64;\n");
}

export function gitIn(root: string, ...args: string[]) {
  return git(root, ...args);
}

/**
 * Puts a fake `gh` first on PATH. It answers `pr view`, lists `remote`
 * comments, and records every POST body in a log instead of reaching GitHub.
 */
export function fakeGh(repo: { baseSha: string; headSha: string }, remote: unknown[] = []) {
  const dir = mkdtempSync(join(tmpdir(), "surface-review-gh-"));
  const log = join(dir, "posts.jsonl");
  const pr = {
    number: 42,
    title: "Loosen token check",
    url: "https://github.com/acme/widgets/pull/42",
    body: "Makes check lenient.",
    author: { login: "dev" },
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
if (args[0] === "pr" && args[1] === "view") { process.stdout.write(JSON.stringify(${JSON.stringify(pr)})); process.exit(0); }
if (args[0] === "api" && args.includes("POST")) {
  const body = JSON.parse(fs.readFileSync(0, "utf8"));
  fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ endpoint: args[3], body }) + "\\n");
  if (body.body.includes("FAIL")) { process.stderr.write("HTTP 422: line must be part of the diff"); process.exit(1); }
  const id = 900 + fs.readFileSync(${JSON.stringify(log)}, "utf8").trim().split("\\n").length;
  process.stdout.write(JSON.stringify({ id, path: body.path, line: body.line, side: body.side, body: body.body, user: { login: "me" }, html_url: "https://github.com/acme/widgets/pull/42#discussion_r" + id, created_at: "2026-10-23T00:00:00Z" }));
  process.exit(0);
}
if (args[0] === "api") { for (const c of ${JSON.stringify(remote)}) console.log(JSON.stringify(c)); process.exit(0); }
process.stderr.write("fake gh: unexpected " + args.join(" ")); process.exit(2);
`;
  writeFileSync(join(dir, "gh"), script);
  chmodSync(join(dir, "gh"), 0o755);
  const previous = process.env.PATH;
  process.env.PATH = `${dir}:${previous}`;
  return {
    posts: (): CommentRequest[] => {
      try {
        return readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
      } catch {
        return [];
      }
    },
    restore: () => (process.env.PATH = previous),
  };
}

/** A score on every axis, each overridable. */
export function scores(overrides: Record<string, number> = {}): NonNullable<FindingInput["scores"]> {
  return Object.fromEntries(FINDING_DIMENSIONS.map((d) => [d.id, { value: overrides[d.id] ?? 3, why: `${d.label} reason` }]));
}

export function looseEquality(): FindingInput {
  return {
    title: "Token compared with loose equality",
    severity: "High",
    confidence: "High",
    category: "security-trust-boundaries",
    summary: "`token == expected` coerces types, so a numeric expected value matches its string form.",
    fix: "Use `===`, or a constant-time compare.",
    evidence: "`const ok = token == expected;` at src/auth.ts:3",
    primary: { path: "src/auth.ts", rev: "head", startLine: 3, endLine: 3 },
    related: [{ path: "src/auth.ts", rev: "base", startLine: 3, endLine: 3, note: "The strict compare this replaced." }],
    visuals: [
      { kind: "mermaid", label: "Flow", source: "flowchart LR\n  A[token] --> B{==}\n  B -->|coerced| C[ok]" },
      { kind: "data", label: "Cases", tables: [{ headers: ["token", "expected", "result"], rows: [["'1'", "1", "true"]], highlight: { "0": "bad" } }] },
    ],
    triage: { bucket: "fix-now", fixSize: "Trivial", touches: ["src/auth.ts"], reason: "High severity and a one-character fix in a file the diff already changes." },
    scores: scores({ impact: 4, confidence: 5, ease: 5, containment: 5 }),
  };
}

export function findingsInput(): FindingsInput {
  return {
    summary: { intent: "Make check lenient.", risk: "High", scope: "diff · 4 files" },
    findings: [
      looseEquality(),
      {
        title: "log is undefined",
        severity: "Medium",
        confidence: "Medium",
        category: "correctness-invariants",
        summary: "`log` is not imported.",
        primary: { path: "src/auth.ts", rev: "head", startLine: 4, endLine: 4 },
        triage: { bucket: "defer", fixSize: "Large", touches: ["src/logger.ts"], reason: "Medium, and the logger it needs lives outside this diff; file a follow-up." },
        scores: scores({ impact: 3, ease: 1, containment: 1 }),
      },
    ],
    dropped: [{ severity: "Low", title: "Rename ok", lens: "code-smells", reason: "style only" }],
  };
}
