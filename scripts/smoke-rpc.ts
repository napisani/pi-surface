// Live smoke test: a real Pi session and model drive one workflow, and
// browser-style HTTP actions start new agent turns. Spends model calls, so it
// is not part of `npm test`.
//   SMOKE_WORKFLOW=review node scripts/smoke-rpc.ts [provider/model]    # local review, one change-request round
//   SMOKE_WORKFLOW=feedback node scripts/smoke-rpc.ts [provider/model]  # triage, a fix round, a reply draft
//   SMOKE_WORKFLOW=forge node scripts/smoke-rpc.ts [provider/model]     # a round, a follow-up, round completion
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ForgeState } from "../skills/surface-forge-solution/surface/state.ts";
import * as review from "../skills/surface-code-review/surface/test/fixtures.ts";
import type { FeedbackState } from "../skills/surface-pr-feedback/surface/state.ts";
import * as feedback from "../skills/surface-pr-feedback/surface/test/fixtures.ts";
import type { Json } from "../src/host/decode.ts";
import { openStream, postAction } from "../test/sse.ts";

const workflow = process.env.SMOKE_WORKFLOW ?? "review";
const model = process.argv[2] ?? "anthropic/claude-sonnet-5-5";
const extension = fileURLToPath(new URL("../extension/index.ts", import.meta.url));

/** The parts of Pi's RPC events this script reads. */
interface ContentBlock {
  type: string;
  text?: string;
}

interface Event {
  type: string;
  toolName?: string;
  args?: Json;
  isError?: boolean;
  result?: { details?: { url?: string; mode?: string } };
  message?: { role?: string; content?: string | ContentBlock[] };
}
const events: Event[] = [];
const waiters: { match: (e: Event) => boolean; resolve: (e: Event) => void }[] = [];

function log(text: string) {
  process.stderr.write(`[smoke] ${text}\n`);
}

function startPi(cwd: string) {
  const pi = spawn("pi", ["--mode", "rpc", "--no-session", "-ne", "-e", extension, "--model", model, "--thinking", "low"], {
    cwd,
    env: { ...process.env, SURFACE_NO_OPEN: "1" },
    stdio: ["pipe", "pipe", "inherit"],
  });
  let buffer = "";
  pi.stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8");
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).replace(/\r$/, "");
      buffer = buffer.slice(newline + 1);
      if (!line) {
        continue;
      }
      const event: Event = JSON.parse(line);
      events.push(event);
      if (event.type === "tool_execution_start") {
        log(`tool ▸ ${event.toolName} ${JSON.stringify(event.args ?? {}).slice(0, 160)}`);
      }
      if (event.type === "tool_execution_end") {
        log(`tool ◂ ${event.toolName}${event.isError ? " ERROR: " + JSON.stringify(event.result).slice(0, 400) : ""}`);
      }
      if (event.type === "message_end" && event.message?.role === "custom") {
        log(`custom ◂ ${String(event.message.content).split("\n")[0]}`);
      }
      if (event.type === "message_end" && event.message?.role === "assistant") {
        const content = event.message.content ?? [];
        const text = (Array.isArray(content) ? content : []).flatMap((c) => (c.type === "text" ? [c.text ?? ""] : [])).join(" ").trim();
        if (text) {
          log(`assistant ◂ ${text.slice(0, 300)}`);
        }
      }
      for (const waiter of [...waiters]) {
        if (waiter.match(event)) {
          waiters.splice(waiters.indexOf(waiter), 1);
          waiter.resolve(event);
        }
      }
    }
  });
  return pi;
}

function waitFor(match: (e: Event) => boolean, label: string, timeoutMs = 300_000): Promise<Event> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${label}`)), timeoutMs);
    waiters.push({ match, resolve: (e) => (clearTimeout(timer), resolve(e)) });
  });
}
const toolEnd = (name: string) => waitFor((e) => e.type === "tool_execution_end" && e.toolName === name && !e.isError, name);
const settled = (label: string) => waitFor((e) => e.type === "agent_settled", label);
const runs = () => events.filter((e) => e.type === "agent_start").length;

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`FAILED: ${message}`);
  }
  log(`ok · ${message}`);
}

async function smokeReview() {
  const repo = review.makeRepo();
  review.addLocalWork(repo.root);
  const pi = startPi(repo.root);
  try {
    log(`model ${model} · repo ${repo.root}`);
    const opened = toolEnd("surface_review_open");
    pi.stdin.write(JSON.stringify({ id: "p1", type: "prompt", message: "/skill:surface-code-review open my local changes" }) + "\n");
    const url = (await opened).result?.details?.url ?? "";
    await settled("open to settle");
    assert((await opened).result?.details?.mode === "live", "a local review opened live");
    const stream = await openStream(new URL("events", url).href);
    await stream.next();
    log("browser ▸ request R1 on src/auth.ts:3, then send");
    assert((await postAction(url, { type: "request.create", anchor: { path: "src/auth.ts", side: "RIGHT", line: 3 }, body: "Use strict equality (===) here." })).status === 202, "request accepted");
    const updated = waitFor((e) => e.type === "tool_execution_end" && e.toolName === "surface_review_request_update", "surface_review_request_update");
    assert((await postAction(url, { type: "requests.send" })).status === 202, "batch sent");
    const update = await updated;
    await settled("request round to settle");
    assert(!update.isError, "the agent reported the round");
    assert(/token === expected/.test(readFileSync(join(repo.root, "src/auth.ts"), "utf8")), "the agent edited the working tree");
    stream.close();
  } finally {
    pi.kill();
  }
}

async function smokeFeedback() {
  const repo = feedback.makeRepo();
  const gh = feedback.fakeGh(repo);
  const pi = startPi(repo.root);
  try {
    log(`model ${model} · repo ${repo.root}`);
    const opened = toolEnd("surface_feedback_open");
    const triaged = toolEnd("surface_feedback_triage");
    pi.stdin.write(JSON.stringify({ id: "p1", type: "prompt", message: "/skill:surface-pr-feedback open the feedback on PR 42" }) + "\n");
    const url = (await opened).result?.details?.url ?? "";
    await triaged;
    await settled("triage to settle");
    const stream = await openStream<FeedbackState>(new URL("events", url).href);
    const snapshot = await stream.next();
    const items = snapshot.type === "STATE_SNAPSHOT" ? snapshot.snapshot.items : [];
    assert(items.filter((i) => !i.hidden).every((i) => i.analysis), "every visible item has an analysis");
    const first = items.find((i) => i.id === "PF-1")!;
    assert(first.analysis?.promised === true && first.fix?.status === "pending", "the fix the user promised in the thread is queued");
    log("browser ▸ send fixes");
    const updated = waitFor((e) => e.type === "tool_execution_end" && e.toolName === "surface_feedback_fix_update", "surface_feedback_fix_update");
    assert((await postAction(url, { type: "fixes.send" })).status === 202, "fixes sent");
    assert(!(await updated).isError, "the agent reported the round");
    await settled("fix round to settle");
    assert(/token === expected/.test(readFileSync(join(repo.root, "src/auth.ts"), "utf8")), "the agent edited the working tree");
    log("browser ▸ reply assist on PF-1");
    const drafted = toolEnd("surface_feedback_reply_draft");
    assert((await postAction(url, { type: "reply.assist", itemId: "PF-1", instruction: "Draft a reply" })).status === 202, "assist accepted");
    log(`draft: ${JSON.stringify((await drafted).args ?? {})}`);
    await settled("reply to settle");
    assert(gh.writes().length === 0, "nothing reached GitHub");
    stream.close();
  } finally {
    pi.kill();
    gh.restore();
  }
}

async function smokeForge() {
  const pi = startPi(process.cwd());
  try {
    log(`model ${model}`);
    const posted = toolEnd("surface_forge_ask");
    pi.stdin.write(
      JSON.stringify({
        id: "p1",
        type: "prompt",
        message:
          "We are designing a small CLI secrets cache. Use surface_forge_ask once to post a round of exactly two decisions. " +
          "D1, header 'Cache scope': should cached secrets be scoped per config file (recommended) or shared? " +
          "D2, header 'Cache location': user cache dir (recommended) or $TMPDIR? " +
          "Each with two options, a 'code' lens showing a Go interface and a 'diff' lens against `type File struct{}`, and three trade-off dimensions. Keep everything short.",
      }) + "\n",
    );
    const url = (await posted).result?.details?.url ?? "";
    await settled("first run to settle");
    assert(/^http:\/\/127\.0\.0\.1:\d+\/[\w-]+\/forge\/$/.test(url), `round posted at ${url}`);
    const stream = await openStream<ForgeState>(new URL("events", url).href);
    const snapshot = await stream.next();
    const questions = snapshot.type === "STATE_SNAPSHOT" ? snapshot.snapshot.questions : [];
    assert(questions.length === 2 && questions[0].round === questions[1].round, "both decisions arrived as one round");

    log("browser ▸ follow-up on D1");
    const before = runs();
    const replied = toolEnd("surface_forge_reply");
    assert((await postAction(url, { type: "followUp", questionId: questions[0].id, optionId: questions[0].options[0].id, text: "Does scoping per config mean two configs with identical sources fetch twice?" })).status === 202, "follow-up accepted");
    await replied;
    await settled("follow-up run to settle");
    assert(runs() > before, "the follow-up started a new agent turn with no prompt from the client");

    log("browser ▸ answer D1, then defer D2");
    const beforeRound = runs();
    assert((await postAction(url, { type: "answer", questionId: questions[0].id, optionId: questions[0].options[1].id, note: "smoke test" })).status === 202, "D1 answer accepted");
    await new Promise((resolve) => setTimeout(resolve, 8000));
    assert(runs() === beforeRound, "D1 alone did not wake the agent (round still open)");
    const summary = waitFor((e) => e.type === "message_end" && e.message?.role === "custom" && String(e.message.content).startsWith("Surface · forge · round"), "round summary");
    assert((await postAction(url, { type: "defer", questionId: questions[1].id })).status === 202, "D2 defer accepted");
    const text = String((await summary).message?.content);
    assert(text.includes(`- ${questions[0].id} `) && text.includes(`- ${questions[1].id} `) && text.includes("deferred"), "one summary carried both decisions");
    await settled("round run to settle");
    assert(runs() === beforeRound + 1, "completing the round woke the agent exactly once");
    stream.close();
  } finally {
    pi.kill();
  }
}

try {
  const smoke = new Map([
    ["forge", smokeForge],
    ["feedback", smokeFeedback],
  ]).get(workflow);
  await (smoke ?? smokeReview)();
  log("PASS");
} catch (error) {
  log(String(error instanceof Error ? error.message : error));
  process.exitCode = 1;
}
