// A plan's directory: state.json (the source of truth), a lock naming the one
// session that writes it, an inbox other sessions drop slice reports into, and
// markdown regenerated from state on every save.
import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { Type } from "typebox";
import { decode, type Json } from "../../../src/host/decode.ts";
import { git } from "../../../src/kit/git.ts";
import type { Runner } from "../../../src/host/runner.ts";
import { SurfaceError } from "../../../src/host/workflow.ts";
import { renderPlanFiles } from "./markdown.ts";
import type { Plan, ReportInput } from "./state.ts";

export const DEFAULT_ROOT = "~/Work";
const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;

const Settings = Type.Object({ surface: Type.Optional(Type.Object({ plans: Type.Optional(Type.Object({ root: Type.Optional(Type.String({ minLength: 1 })) })) })) });

/** The plans root from surface.plans.root, with ~ expanded. */
export function plansRoot(settings: Json): string {
  const root = decode(Settings, settings, "settings").surface?.plans?.root ?? DEFAULT_ROOT;
  const expanded = root === "~" || root.startsWith("~/") ? join(homedir(), root.slice(1)) : root;
  if (!isAbsolute(expanded)) {
    throw new SurfaceError(`surface.plans.root must be absolute or start with ~, got "${root}"`);
  }
  return resolve(expanded);
}

/** The repository's name: its main worktree's directory, so every worktree of a repo shares plans. */
export async function repoName(runner: Runner, worktree: string): Promise<string> {
  const common = (await git(runner, worktree, "rev-parse", "--path-format=absolute", "--git-common-dir")).trim();
  return basename(dirname(common));
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

export function checkSlug(slug: string): void {
  if (!SLUG.test(slug)) {
    throw new SurfaceError(`"${slug}" is not a plan slug; use lowercase letters, digits and dashes`);
  }
}

export const planDir = (root: string, repo: string, slug: string) => join(root, repo, slug);

/** The plans already under a repo, by slug. */
export async function listPlans(root: string, repo: string): Promise<string[]> {
  const entries = await readdir(join(root, repo), { withFileTypes: true }).catch(() => []);
  const found = await Promise.all(
    entries.filter((e) => e.isDirectory()).map(async (e) => ((await readFile(join(root, repo, e.name, "state.json")).catch(() => undefined)) ? e.name : undefined)),
  );
  return found.filter((s): s is string => s !== undefined).sort();
}

export async function loadPlan(dir: string): Promise<Plan | undefined> {
  const text = await readFile(join(dir, "state.json"), "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  });
  if (text === undefined) {
    return undefined;
  }
  // SAFETY: only savePlan writes state.json, and it writes a Plan.
  return JSON.parse(text) as Plan;
}

/** Writes through a temporary file and a rename, so a crash never leaves half a file. */
async function writeAtomic(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(tmp, text);
  await rename(tmp, path);
}

/** Saves state.json, then regenerates the markdown views and drops ones for nodes and slices that are gone. */
export async function savePlan(dir: string, plan: Plan): Promise<void> {
  await writeAtomic(join(dir, "state.json"), `${JSON.stringify(plan, null, 2)}\n`);
  const files = renderPlanFiles(plan);
  await Promise.all([...files].map(([path, text]) => writeAtomic(join(dir, path), text)));
  for (const sub of ["decisions", "slices"]) {
    // oxlint-disable-next-line no-await-in-loop -- two directories, pruned one after the other
    const present = await readdir(join(dir, sub)).catch(() => []);
    // oxlint-disable-next-line no-await-in-loop -- see above
    await Promise.all(present.filter((name) => name.endsWith(".md") && !files.has(`${sub}/${name}`)).map((name) => rm(join(dir, sub, name), { force: true })));
  }
}

// ---- lock ----

export interface LockInfo {
  session: string;
  pid: number;
  at: string;
}

const Lock = Type.Object({ session: Type.String(), pid: Type.Integer(), at: Type.String() });

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the process exists but belongs to someone else.
    return error instanceof Error && "code" in error && error.code === "EPERM";
  }
}

export async function readLock(dir: string): Promise<LockInfo | undefined> {
  const text = await readFile(join(dir, "lock"), "utf8").catch(() => undefined);
  if (!text) {
    return undefined;
  }
  try {
    return decode(Lock, JSON.parse(text), "lock");
  } catch {
    return undefined;
  }
}

/** Takes the lock unless another live session holds it; returns that holder when it does. */
export async function takeLock(dir: string, session: string, force = false): Promise<LockInfo | undefined> {
  const held = await readLock(dir);
  if (!force && held && held.session !== session && alive(held.pid)) {
    return held;
  }
  await writeAtomic(join(dir, "lock"), JSON.stringify({ session, pid: process.pid, at: new Date().toISOString() } satisfies LockInfo));
  return undefined;
}

export async function releaseLock(dir: string, session: string): Promise<void> {
  if ((await readLock(dir))?.session === session) {
    await rm(join(dir, "lock"), { force: true });
  }
}

// ---- inbox ----

const Report = Type.Object({
  sliceId: Type.String(),
  status: Type.Union([Type.Literal("in-progress"), Type.Literal("done"), Type.Literal("blocked")]),
  note: Type.String(),
  deviations: Type.Array(Type.Object({ text: Type.String(), nodes: Type.Array(Type.String()) })),
  from: Type.Optional(Type.String()),
  at: Type.String(),
});

/** Drops one report into the plan's inbox; it needs no lock. */
export async function sendReport(dir: string, report: ReportInput): Promise<void> {
  await writeAtomic(join(dir, "inbox", `${Date.now()}-${randomBytes(3).toString("hex")}.json`), JSON.stringify(report));
}

/** The inbox's reports, oldest first, and a function that files them as taken in. */
export async function readInbox(dir: string): Promise<{ reports: ReportInput[]; done(): Promise<void> }> {
  const names = (await readdir(join(dir, "inbox")).catch(() => [])).filter((n) => n.endsWith(".json")).sort();
  const reports: ReportInput[] = [];
  const taken: string[] = [];
  for (const name of names) {
    // oxlint-disable-next-line no-await-in-loop -- reports are read in arrival order
    const text = await readFile(join(dir, "inbox", name), "utf8").catch(() => undefined);
    try {
      reports.push(decode(Report, JSON.parse(text ?? ""), `report ${name}`));
    } catch {
      // A malformed report is moved aside with the rest so it does not block the inbox.
    }
    taken.push(name);
  }
  return {
    reports,
    done: async () => {
      await mkdir(join(dir, "inbox", "ingested"), { recursive: true });
      await Promise.all(taken.map((name) => rename(join(dir, "inbox", name), join(dir, "inbox", "ingested", name))));
    },
  };
}

export async function writeArtifact(dir: string, name: string, markdown: string): Promise<string> {
  const path = join(dir, "artifacts", name);
  await writeAtomic(path, markdown.endsWith("\n") ? markdown : `${markdown}\n`);
  return path;
}
