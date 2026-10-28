import { spawn } from "node:child_process";

export interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
}

/** Runs a command; tests replace gh on PATH and use temporary repositories so nothing reaches GitHub. */
export type Runner = (command: string, args: string[], options: { cwd: string; input?: string }) => Promise<RunResult>;

export class CommandError extends Error {}

const MAX_OUTPUT = 64 * 1024 * 1024;

export const spawnRunner: Runner = (command, args, { cwd, input }) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, GH_PROMPT_DISABLED: "1", GIT_TERMINAL_PROMPT: "0" } });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let size = 0;
    child.stdout.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_OUTPUT) {
        child.kill();
      } else {
        out.push(chunk);
      }
    });
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    child.on("error", reject);
    child.on("close", (code) =>
      resolve({ stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8"), code: size > MAX_OUTPUT ? 1 : (code ?? 1) }),
    );
    child.stdin.on("error", reject);
    child.stdin.end(input);
  });

/** Runs a command and returns stdout, or throws CommandError with the tail of its output. */
export async function run(runner: Runner, cwd: string, command: string, args: string[], input?: string, okCodes = [0]): Promise<string> {
  const result = await runner(command, args, { cwd, input });
  if (!okCodes.includes(result.code)) {
    const detail = (result.stderr || result.stdout).trim().split("\n").slice(-4).join("\n");
    throw new CommandError(`${command} ${args.slice(0, 3).join(" ")} failed: ${detail || `exit ${result.code}`}`);
  }
  return result.stdout;
}
