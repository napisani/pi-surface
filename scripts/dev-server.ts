// Serves one workflow's page with fixtures and no Pi session. A scripted agent
// answers page events; for review and feedback a fake gh answers GitHub calls
// (writes are logged, never sent), so every flow can be clicked through.
//   node scripts/dev-server.ts                                # review: local changes, no PR
//   DEV_WORKFLOW=review DEV_MODE=pr node scripts/dev-server.ts      # someone else's PR, pinned
//   DEV_WORKFLOW=review DEV_MODE=pr-live node scripts/dev-server.ts # your own PR, live working tree
//   DEV_WORKFLOW=feedback node scripts/dev-server.ts          # a PR with review feedback
//   DEV_WORKFLOW=feedback DEV_MODE=chat node scripts/dev-server.ts  # local work, feedback from chat
//   DEV_WORKFLOW=forge node scripts/dev-server.ts             # a design session with a draft
/* oxlint-disable no-console -- a dev tool whose output is its console log */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnRunner } from "../src/host/runner.ts";
import { Surface } from "../src/host/surface.ts";
import type { AnyWorkflow, SurfaceAction } from "../src/host/workflow.ts";
import type { ForgeAction } from "../skills/surface-forge-solution/surface/actions.ts";
import { cacheIsolation } from "../skills/surface-forge-solution/surface/test/fixtures.ts";
import forgeWorkflow from "../skills/surface-forge-solution/surface/workflow.ts";
import type { PageAction as ReviewAction } from "../skills/surface-code-review/surface/actions.ts";
import * as reviewFixtures from "../skills/surface-code-review/surface/test/fixtures.ts";
import reviewWorkflow from "../skills/surface-code-review/surface/workflow.ts";
import type { PageAction as FeedbackAction } from "../skills/surface-pr-feedback/surface/actions.ts";
import type { AnalysisInput } from "../skills/surface-pr-feedback/surface/state.ts";
import * as feedbackFixtures from "../skills/surface-pr-feedback/surface/test/fixtures.ts";
import feedbackWorkflow from "../skills/surface-pr-feedback/surface/workflow.ts";

const workflowId = process.env.DEV_WORKFLOW ?? "review";
const mode = process.env.DEV_MODE ?? (workflowId === "feedback" ? "pr" : "local");
const WORKFLOWS = new Map<string, AnyWorkflow>([
  ["forge", forgeWorkflow],
  ["review", reviewWorkflow],
  ["feedback", feedbackWorkflow],
]);
const workflow = WORKFLOWS.get(workflowId);
if (!workflow) {
  throw new Error(`DEV_WORKFLOW must be one of ${[...WORKFLOWS.keys()].join(", ")}`);
}

const later = (fn: () => void, ms = 1200) =>
  setTimeout(() => {
    Promise.resolve()
      .then(fn)
      .catch((error) => console.error(error));
  }, ms);

let agent: (action: SurfaceAction) => void = () => undefined;
const surface = new Surface(
  {
    persist: () => undefined,
    notifyAgent: (id, content, action) => {
      console.log(`\n[agent would receive]\nSurface · ${id} · ${content}\n`);
      agent(action);
    },
    runner: spawnRunner,
  },
  [workflow],
  fileURLToPath(new URL("../web", import.meta.url)),
);

async function startReview(): Promise<string> {
  const { addLocalWork, fakeGh, findingsInput, makeRepo } = reviewFixtures;
  const repo = process.env.DEV_REPO ? { root: process.env.DEV_REPO, baseSha: process.env.DEV_BASE!, headSha: process.env.DEV_HEAD! } : makeRepo();
  if (!process.env.DEV_REPO && mode !== "pr") {
    addLocalWork(repo.root);
  }
  fakeGh(repo, [
    { id: 11, path: "src/auth.ts", line: 2, side: "RIGHT", body: "Should an empty token log too?", user: { login: "reviewer" }, html_url: "https://example.invalid/11", created_at: "2026-10-20T10:00:00Z" },
    { id: 12, in_reply_to_id: 11, path: "src/auth.ts", line: 2, side: "RIGHT", body: "No, that path is hot.", user: { login: "dev" }, html_url: "https://example.invalid/12", created_at: "2026-10-20T11:00:00Z" },
  ]);
  const review = surface.typed(reviewWorkflow).session;
  agent = (sent) => {
    // SAFETY: the dev server runs one workflow, so every action it hears is that workflow's.
    const action = sent as ReviewAction;
      if (action.type === "review.run") {
        later(() => review.setTaskStatus("review", "running", "6 lenses running"), 600);
        later(() => review.postFindings(process.env.DEV_REPO ? { ...findingsInput(), findings: [] } : findingsInput()), 2500);
      } else if (action.type === "walkthrough.run") {
        later(() =>
          review.postWalkthrough({
            title: "Loosening the token check",
            summary: "The PR swaps a strict compare for a loose one and adds logging. Start at the compare, then the test that should catch it.",
            steps: [
              { title: "The compare", body: "`==` replaces `===`; this is the behavior change.", ref: { path: "src/auth.ts", rev: "work", startLine: 3, endLine: 5 }, visual: { kind: "mermaid", label: "Before / after", source: "flowchart LR\n  T[token] -->|before: ===| S[strict]\n  T -->|after: ==| L[coerced]" } },
              { title: "What it replaced", body: "The old strict compare.", ref: { path: "src/auth.ts", rev: "base", startLine: 3, endLine: 3 } },
              { title: "The new test", body: "It asserts nothing yet.", ref: { path: "src/auth.test.ts", rev: "work", startLine: 1, endLine: 1 } },
            ],
          }),
        );
      } else if (action.type === "requests.send") {
        const sent = review.state.requests.filter((r) => r.status === "sent");
        later(() => {
          const updates = sent.map((r) => {
            if (!r.anchor || r.anchor.side === "LEFT") {
              return r.messages.length > 1
                ? { requestId: r.id, status: "done" as const, reply: "Done across the change." }
                : { requestId: r.id, status: "needs-input" as const, reply: "Which files should this cover?" };
            }
            // Stand-in for a real edit: note the request above the anchored line.
            const file = join(repo.root, r.anchor.path);
            const lines = readFileSync(file, "utf8").split("\n");
            lines.splice(r.anchor.line - 1, 0, `// ${r.id}: ${r.messages.at(-1)!.text}`);
            writeFileSync(file, lines.join("\n"));
            return { requestId: r.id, status: "done" as const, reply: `Added a note above line ${r.anchor.line}.`, anchor: { path: r.anchor.path, side: "RIGHT" as const, line: r.anchor.line } };
          });
          void review.updateRequests(updates);
        }, 1500);
      } else if (action.type === "findings.autoComment") {
        for (const id of action.findingIds) {
          later(() => review.draftComment({ findingId: id, body: `Drafted for ${id}: this needs a look.`, note: "short and direct" }));
        }
      } else if (action.type === "comment.assist" || (action.type === "comment.create" && action.then !== undefined && action.then !== "post")) {
        const id = action.type === "comment.assist" ? action.commentId : review.state.comments.at(-1)!.id;
        later(() => review.draftComment({ commentId: id, body: "`==` coerces types here.\n\n```suggestion\n  const ok = token === expected;\n```", note: "added a suggestion" }));
      } else if (action.type === "question.ask" || action.type === "question.followUp") {
        const id = action.type === "question.followUp" ? action.questionId : review.state.questions.at(-1)!.id;
        later(() =>
          review.questionReply(id, "`log` records every result, including failures, so a bad token shows up in the logs.", [
            { kind: "mermaid", label: "Call flow", source: "sequenceDiagram\n  participant H as handler\n  participant C as check\n  participant L as log\n  H->>C: check(token, expected)\n  C->>L: log(ok)\n  C-->>H: ok", look: "log runs on every call, not only on failure." },
          ]),
        );
      } else if (action.type === "finding.ask") {
        later(() => review.findingReply(action.findingId, "Nothing upstream narrows the types.", [{ kind: "callTree", label: "Call path", text: "handler\n  parseHeader   -> string\n  check(token, expected)\n    token == expected   <- coerces" }]));
      }
    
  };
  return review.open(mode === "local" ? { worktree: repo.root } : { worktree: repo.root, pr: "42", live: mode === "pr-live" });
}

async function startFeedback(): Promise<string> {
  const { analysis, fakeGh, makeRepo } = feedbackFixtures;
  const repo = makeRepo();
  const gh = fakeGh(repo);
  process.on("SIGINT", () => {
    console.log("gh writes:", JSON.stringify(gh.writes(), null, 2));
    process.exit(0);
  });
  const TRIAGE = new Map<string, Partial<AnalysisInput>>(Object.entries({
  "PF-1": { promised: true, promisedFix: "Switch the compare back to ===." },
  "PF-2": {
    recommendation: "respond",
    meaning: "Bob can't find where `log` comes from. Nothing in this file imports it.",
    rationale: "A real bug: `log` is undefined at runtime, so `check` throws on every call.",
    risk: "Low",
    importance: "High",
    nextStep: "Import log from ./logger, then reply naming the import.",
    visuals: [{ kind: "callTree", label: "Call path", text: "handler\n  check(token, expected)\n    log(ok)   <- ReferenceError: log is not defined", look: "Every call reaches log, so this fails on the happy path too." }],
  },
  "PF-3": { meaning: "Bob wants a test proving an empty token is rejected.", rationale: "Cheap, and it pins the guard on line 2.", nextStep: "Add a test that check('', 'x') returns false.", refs: [{ path: "src/auth.ts", rev: "head", startLine: 2, endLine: 2, note: "The guard the test should cover." }] },
  "PF-4": { recommendation: "skip", meaning: "Carol wants the docs to mention the loose compare.", rationale: "PF-1 makes the compare strict again, so there is nothing to document.", importance: "Low", nextStep: "Reply that the compare is strict again after PF-1." },
}));
  const feedback = surface.typed(feedbackWorkflow).session;
  agent = (sent) => {
    // SAFETY: the dev server runs one workflow, so every action it hears is that workflow's.
    const action = sent as FeedbackAction;
      const state = () => feedback.state;
      if (action.type === "triage.run") {
        const ids = action.itemIds ?? state().items.filter((i) => !i.hidden && !i.analysis).map((i) => i.id);
        later(() => feedback.postAnalyses(ids.map((id) => analysis(id, TRIAGE.get(id) ?? { meaning: "A reviewer note.", recommendation: "respond" })), true));
      } else if (action.type === "item.ask") {
        later(() =>
          feedback.answer(action.itemId, "The reviewer is right: nothing narrows the types before the compare, so `'1' == 1` passes.", [
            { kind: "data", label: "Cases", tables: [{ headers: ["token", "expected", "== result"], rows: [["'1'", "1", "true"], ["''", "0", "true"]], highlight: { "0": "bad", "1": "bad" } }] },
          ]),
        );
      } else if (action.type === "fixes.send") {
        const sent = state().items.filter((i) => i.fix?.status === "sent");
        later(async () => {
          const file = join(repo.root, "src/auth.ts");
          writeFileSync(file, readFileSync(file, "utf8").replace("token == expected", "token === expected"));
          await feedback.updateFixes(
            sent.map((i) =>
              i.id === "PF-1"
                ? { itemId: i.id, status: "done" as const, reply: "Back to `===` on line 3.", files: ["src/auth.ts"] }
                : { itemId: i.id, status: "needs-input" as const, reply: "Should the test go in src/auth.test.ts or a new file?" },
            ),
          );
        }, 1500);
      } else if (action.type === "commits.propose") {
        const fixed = state().items.filter((i) => i.fix?.status === "done");
        later(() => feedback.proposeCommits([{ message: "Compare tokens strictly again", items: fixed.map((i) => i.id), paths: [...new Set(fixed.flatMap((i) => i.fix!.files))] }]));
      } else if (action.type === "reply.assist") {
        later(() => feedback.draftReply(action.itemId, "Switched back to `===` in 4f2a19c.", "named the commit"));
      } else if (action.type === "replies.autoDraft") {
        action.itemIds.forEach((id, n) => later(() => feedback.draftReply(id, `Drafted for ${id}: fixed, see the commit.`, "one line"), 800 + n * 400));
      }
    
  };
  const opened = mode === "chat" ? await feedback.open({ worktree: repo.root, base: "main" }) : await feedback.open({ worktree: repo.root, pr: "42" });
  if (mode === "chat") {
    feedback.addChatItemsForTriage([{ body: "Rename ok to matches; ok says nothing.", author: "Sam", ref: { path: "src/auth.ts", rev: "work", startLine: 3, endLine: 3 } }]);
  }
  const ids = feedback.state.items.filter((i) => !i.hidden && !i.analysis).map((i) => i.id);
  later(() => feedback.postAnalyses(ids.map((id) => analysis(id, TRIAGE.get(id) ?? { meaning: "Sam finds the name ok vague.", recommendation: "fix" })), true), 1500);
  return opened.url;
}

async function startForge(): Promise<string> {
  const forge = surface.typed(forgeWorkflow).session;
  agent = (sent) => {
    // SAFETY: the dev server runs one workflow, so every action it hears is that workflow's.
    const action = sent as ForgeAction;
    if (action.type === "followUp") {
      later(() => forge.reply(action.questionId, "Good question; the cache holds remote values only.", action.optionId));
    }
    if (action.type === "draft.review" && action.verdict === "changes") {
      later(() => forge.postDraft(action.kind, `${forge.state.drafts[action.kind]!.markdown}\n\n## Revision\nAddressed: ${action.note}`, { final: true, path: ".scratch/specs/dev.md" }));
    }
  };
  const designQuestion = cacheIsolation();
  Object.assign(designQuestion, { id: "D3", header: "Design shape", title: "Where should named workflow selections act in the secret-loading flow?", prerequisites: ["D1", "D2"] });
  designQuestion.options[0].label = "Filter merged values";
  designQuestion.options[1].label = "Select within each provider";
  const url = await forge.askRound([designQuestion]);
  await forge.handleAction({ type: "answer", questionId: "D3", optionId: "isolate" });
  await forge.askRound([cacheIsolation()]);
  forge.reply("D7", "No. 'Cache' is the storage backend for remote values; a .env file would be a source.", "isolate");
  forge.postDraft("spec", [
  "# Named workflow selections",
  "",
  "## Summary",
  "Profiles filter the merged values after every provider has loaded, so one selection works the same for every provider.",
  "",
  "## Domain types",
  "```ts",
  "interface Profile { name: string; keys: string[] }",
  "type CacheScope = string // TBD(D7): per config, or shared",
  "```",
  "",
  "## Cache",
  "TBD(D7): whether one config can read another config's cached values. This section waits on that decision.",
  "",
  "## Failure handling",
  "- A missing key fails the run with exit code 2.",
  "- TBD: what happens when a provider times out. No question covers this yet.",
  "",
  "## Test plan",
  "| Behavior | Test |",
  "|---|---|",
  "| Filtering keeps only selected keys | `profile_test.go` |",
  "| Cache isolation | TBD(D7) |",
].join("\n"));
  if (mode === "final") {
    forge.postDraft("spec", forge.state.drafts.spec!.markdown, { final: true, path: ".scratch/specs/dev.md" });
  }
  return url;
}

const START = new Map([
  ["forge", startForge],
  ["feedback", startFeedback],
  ["review", startReview],
]);
const url = await START.get(workflowId)!();
console.log(`surface dev server (${workflowId}, ${mode}): ${url}`);
