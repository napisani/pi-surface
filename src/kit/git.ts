// git and gh calls shared by workflows that work on a checkout. Workflow-specific
// GitHub calls (posting comments, listing feedback) live with their workflow.
import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { Type } from "typebox";
import { decode, type Json } from "../host/decode.ts";
import { CommandError, run, type Runner } from "../host/runner.ts";
import { SurfaceError } from "../host/workflow.ts";
import { categorize } from "./categorize.ts";
import { checkPath, REVS, type Rev } from "./code.ts";

export type Category = "impl" | "test" | "docs" | "config";
export type FileStatus = "added" | "modified" | "deleted" | "renamed" | "copied";

// The first header line that matches names the change; a diff with none of them modified the file.
const STATUS_MARKERS = [
  [/^new file mode/m, "added"],
  [/^deleted file mode/m, "deleted"],
  [/^rename from/m, "renamed"],
  [/^copy from/m, "copied"],
] as const;

export interface PrFile {
  path: string;
  previousPath?: string;
  status: FileStatus;
  additions: number;
  deletions: number;
  binary: boolean;
  category: Category;
  /** Hash of the file's diff; it changes when the file's changes do. */
  fingerprint: string;
}

/** GitHub's view of a PR, as gh pr view reports it. */
export interface PrInfo {
  owner: string;
  repo: string;
  number: number;
  title: string;
  url: string;
  author: string;
  body: string;
  baseRef: string;
  headRef: string;
  baseSha: string;
  headSha: string;
  isDraft: boolean;
  state: string;
}

const MAX_UNTRACKED = 300;

export const git = (runner: Runner, cwd: string, ...args: string[]) => run(runner, cwd, "git", ["-c", "core.quotePath=false", ...args]);
// Explicit prefixes: diff.mnemonicPrefix or diff.noprefix in a user's config would change a/ and b/.
const DIFF = ["diff", "--no-ext-diff", "--no-color", "--src-prefix=a/", "--dst-prefix=b/", "-M", "-U3"];

export async function hasCommit(runner: Runner, cwd: string, ref: string): Promise<boolean> {
  return (await runner("git", ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], { cwd })).code === 0;
}

export async function isAncestor(runner: Runner, cwd: string, commit: string, of: string): Promise<boolean> {
  return (await runner("git", ["merge-base", "--is-ancestor", commit, of], { cwd })).code === 0;
}

export async function defaultBase(runner: Runner, worktree: string): Promise<string> {
  const remoteHead = await runner("git", ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"], { cwd: worktree });
  if (remoteHead.code === 0 && remoteHead.stdout.trim()) {
    return remoteHead.stdout.trim();
  }
  for (const ref of ["origin/main", "origin/master", "main", "master"]) {
    // oxlint-disable-next-line no-await-in-loop -- the refs are tried in order and the first that exists wins
    if (await hasCommit(runner, worktree, ref)) {
      return ref;
    }
  }
  throw new CommandError("could not find a default branch to compare against; pass base explicitly");
}

export function checkWorktree(worktree: string): void {
  if (!isAbsolute(worktree)) {
    throw new CommandError(`worktree must be an absolute path, got "${worktree}"`);
  }
}

/**
 * Splits a unified diff into its file list. Each file's fingerprint is a hash
 * of its diff, so the page can tell which files changed between refreshes.
 */
export function parseDiffFiles(diff: string): PrFile[] {
  const chunks = diff.split(/^diff --git /m).slice(1);
  return chunks.map((chunk) => {
    const header = chunk.slice(0, chunk.indexOf("\n") < 0 ? chunk.length : chunk.indexOf("\n"));
    const line = (re: RegExp) => re.exec(chunk)?.[1]?.replace(/\t$/, "");
    const renameTo = line(/^rename to (.*)$/m) ?? line(/^copy to (.*)$/m);
    const renameFrom = line(/^rename from (.*)$/m) ?? line(/^copy from (.*)$/m);
    const plus = line(/^\+\+\+ b\/(.*)$/m);
    const minus = line(/^--- a\/(.*)$/m);
    // Without ---/+++ lines (mode-only or binary changes) the header is "a/<p> b/<p>".
    const fromHeader = header.slice(2, 2 + (header.length - 5) / 2);
    const path = renameTo ?? plus ?? minus ?? fromHeader;
    const status = STATUS_MARKERS.find(([marker]) => marker.test(chunk))?.[1] ?? "modified";
    let additions = 0;
    let deletions = 0;
    const body = chunk.indexOf("\n@@");
    if (body >= 0) {
      for (const l of chunk.slice(body + 1).split("\n")) {
        if (l.startsWith("+") && !l.startsWith("+++")) {
          additions++;
        } else if (l.startsWith("-") && !l.startsWith("---")) {
          deletions++;
        }
      }
    }
    const file: PrFile = {
      path,
      status,
      additions,
      deletions,
      binary: /^Binary files /m.test(chunk),
      category: categorize(path),
      fingerprint: createHash("sha1").update(chunk).digest("hex").slice(0, 12),
    };
    if (renameFrom && renameFrom !== path) {
      file.previousPath = renameFrom;
    }
    return file;
  });
}

// What `gh pr view --json` returns for PR_FIELDS. A deleted account comes back as a null author.
const GhPr = Type.Object({
  number: Type.Integer(),
  title: Type.String(),
  url: Type.String(),
  body: Type.Optional(Type.String()),
  author: Type.Optional(Type.Union([Type.Object({ login: Type.String() }), Type.Null()])),
  baseRefName: Type.String(),
  headRefName: Type.String(),
  baseRefOid: Type.String(),
  headRefOid: Type.String(),
  isDraft: Type.Boolean(),
  state: Type.String(),
});

const PR_FIELDS = "number,title,url,body,author,baseRefName,headRefName,baseRefOid,headRefOid,isDraft,state";
const PR_URL = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/;

export async function viewPr(runner: Runner, worktree: string, ref: string): Promise<PrInfo> {
  const json: Json = JSON.parse(await run(runner, worktree, "gh", ["pr", "view", ref, "--json", PR_FIELDS]));
  const gh = decode(GhPr, json, "gh pr view");
  const match = PR_URL.exec(gh.url);
  if (!match) {
    throw new CommandError(`gh returned a PR URL this tool does not understand: ${gh.url}`);
  }
  return {
    owner: match[1],
    repo: match[2],
    number: gh.number,
    title: gh.title,
    url: gh.url,
    author: gh.author?.login ?? "",
    body: gh.body ?? "",
    baseRef: gh.baseRefName,
    headRef: gh.headRefName,
    baseSha: gh.baseRefOid,
    headSha: gh.headRefOid,
    isDraft: gh.isDraft,
    state: gh.state,
  };
}

/** Names the commands to fetch a PR's commits when the worktree lacks them. */
export async function checkPrCommits(runner: Runner, worktree: string, pr: PrInfo): Promise<void> {
  const missing = [];
  if (!(await hasCommit(runner, worktree, pr.headSha))) {
    missing.push(`head ${pr.headSha.slice(0, 12)} (git fetch origin pull/${pr.number}/head)`);
  }
  if (!(await hasCommit(runner, worktree, pr.baseSha))) {
    missing.push(`base ${pr.baseSha.slice(0, 12)} (git fetch origin ${pr.baseRef})`);
  }
  if (missing.length) {
    throw new CommandError(`the worktree at ${worktree} is missing ${missing.join(" and ")}`);
  }
}

async function untracked(runner: Runner, worktree: string): Promise<string[]> {
  const out = await git(runner, worktree, "ls-files", "--others", "--exclude-standard", "-z");
  return out.split("\0").filter(Boolean).slice(0, MAX_UNTRACKED);
}

/**
 * The unified diff from one commit to another, or to the working tree when
 * `to` is omitted, with untracked files as added. Three lines of context
 * match what GitHub shows.
 */
export async function readDiff(runner: Runner, worktree: string, from: string, to?: string): Promise<string> {
  if (to !== undefined) {
    return git(runner, worktree, ...DIFF, from, to);
  }
  const tracked = await git(runner, worktree, ...DIFF, from);
  const extra = await Promise.all(
    (await untracked(runner, worktree)).map((path) =>
      // --no-index exits 1 when the files differ, which they always do here.
      run(runner, worktree, "git", ["-c", "core.quotePath=false", ...DIFF, "--no-index", "--", "/dev/null", path], undefined, [0, 1]),
    ),
  );
  return [tracked, ...extra].join("");
}

/** The commit each Rev reads from; an absent rev cannot be read. */
export interface Revisions {
  worktree: string;
  base: string;
  head?: string;
  since?: string;
  /** True when the working tree on disk is part of what the page shows. */
  work?: boolean;
}

export function availableRevs(revs: Revisions): Rev[] {
  return REVS.filter((rev) => {
    if (rev === "base") {
      return true;
    }
    return rev === "work" ? revs.work === true : revs[rev] !== undefined;
  });
}

/**
 * A file's text at one revision. Working-tree reads resolve symlinks and must
 * stay inside the worktree.
 */
export async function readBlob(runner: Runner, revs: Revisions, rev: Rev, path: string): Promise<string> {
  checkPath(path, "blob");
  if (!availableRevs(revs).includes(rev)) {
    throw new SurfaceError(`"${rev}" is not a revision this page can read`);
  }
  if (rev !== "work") {
    return git(runner, revs.worktree, "show", `${rev === "base" ? revs.base : revs[rev]}:${path}`);
  }
  const root = await realpath(revs.worktree);
  const file = await realpath(join(root, path)).catch(() => {
    throw new CommandError(`${path} does not exist in the working tree`);
  });
  const rel = relative(root, file);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new CommandError(`${path} resolves outside the worktree`);
  }
  return readFile(file, "utf8");
}

/** The page's blob route: ?rev=<Rev>&path=<path>. */
export function blobRoute(runner: Runner, revisions: () => Revisions): (query: URLSearchParams) => Promise<string> {
  return async (query) => {
    const rev = REVS.find((r) => r === query.get("rev"));
    const path = query.get("path");
    if (!rev || !path) {
      throw new SurfaceError(`blob needs rev=${REVS.join("|")} and a path`);
    }
    return readBlob(runner, revisions(), rev, path);
  };
}
