import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { FINDING_DIMENSIONS, type Finding, type TriageBucket } from "../../../../src/kit/findings.ts";
import { renderSurface } from "../../../../test/web/surface.tsx";
import { emptyState, type ChangeRequest, type ReviewState } from "../state.ts";
import { FindingDetail } from "./FindingDetail.tsx";
import { FindingList } from "./FindingList.tsx";
import { NavContext, type ReviewNav } from "./nav.ts";

afterEach(cleanup);

const nav: ReviewNav = { jumpTo: () => undefined, openFinding: () => undefined };
const scores = Object.fromEntries(FINDING_DIMENSIONS.map((d) => [d.id, { value: 4, why: `${d.label} why` }]));

const finding = (id: string, bucket: TriageBucket, touches = ["a.ts"]): Finding => ({
  id,
  title: `Title ${id}`,
  severity: bucket === "skip" ? "Low" : "High",
  confidence: "High",
  category: "correctness",
  summary: "s",
  primary: { path: "a.ts", rev: "work", startLine: 1, endLine: 1 },
  related: [],
  visuals: [],
  dismissed: false,
  thread: [],
  triage: { bucket, fixSize: "Small", touches, reason: `Reason ${id}` },
  scores,
});

const fixed: ChangeRequest = {
  id: "R1",
  origin: { kind: "finding", findingId: "F1", findingTitle: "Title F1" },
  status: "done",
  messages: [
    { role: "user", text: "Fix F1", at: "t1" },
    { role: "agent", text: "Switched to ===", at: "t2" },
  ],
  createdAt: "t",
  updatedAt: "t",
};

function state(): ReviewState {
  return {
    ...emptyState(),
    target: { worktree: "/w", mode: "live", baseRef: "main", mergeBase: "b", head: "h", branch: "x", title: "t", revision: 1, loadedAt: "t" },
    files: [{ path: "a.ts", status: "modified", additions: 1, deletions: 1, binary: false, category: "impl", fingerprint: "fp" }],
    review: { status: "done", summary: { intent: "i", risk: "High", scope: "diff" }, findings: [finding("F1", "fix-now"), finding("F2", "fix-now"), finding("F3", "skip")], dropped: [], disagreements: [] },
    requests: [fixed],
  };
}

test("findings group by triage bucket, a fixed one says so, and select-all skips it", async () => {
  const { posts } = renderSurface(<FindingList active={undefined} onOpen={() => undefined} />, state());
  assert.ok(screen.getByText("Fix now · 2"));
  assert.ok(screen.getByText("Skip · 1"));
  assert.ok(screen.getByText("✓ fixed"));
  assert.ok(screen.getByText("1 fixed"));

  fireEvent.click(screen.getByText(/selected$/));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: /Make change requests/ })));
  assert.deepEqual(posts.at(-1)?.action, { type: "findings.request", findingIds: ["F2", "F3"] });

  fireEvent.click(screen.getByText("hide fixed"));
  assert.equal(screen.queryByText("Title F1"), null);
  assert.ok(screen.getByText("Fix now · 1"));
});

test("a finding's detail shows its fix outcome, its triage, and a score with a reason on every axis", () => {
  // The code refs load their file over the page's blob route; there is no server here.
  globalThis.fetch = async () => new Response("const a = 1;\n");
  const s = state();
  const f = finding("F1", "fix-now-expands", ["a.ts", "b.ts"]);
  renderSurface(
    <NavContext value={nav}>
      <FindingDetail finding={f} />
    </NavContext>,
    { ...s, review: { ...s.review, findings: [f, ...s.review.findings.slice(1)] } },
  );
  assert.ok(screen.getByText("R1: Switched to ==="));
  assert.ok(screen.getByText("Fix now · expands scope"));
  assert.ok(screen.getByText("expands scope"));
  assert.equal(screen.getByText("b.ts").getAttribute("title"), "outside the diff");
  for (const d of FINDING_DIMENSIONS) {
    assert.ok(screen.getByText(`${d.label} why`));
  }
  assert.ok(screen.getByRole("button", { name: "Request it again" }));
});
