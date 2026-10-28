import { parsePatchFiles } from "@pierre/diffs";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { Profiler } from "react";
import { renderSurface } from "../../../../test/web/surface.tsx";
import { emptyState, type ChangeRequest, type DraftComment, type ReviewState } from "../state.ts";
import { CommentCard } from "./CommentCard.tsx";
import { renderLineItem } from "./LineItem.tsx";
import { NavContext, type ReviewNav } from "./nav.ts";

afterEach(cleanup);

const [fileDiff] = parsePatchFiles("diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-a\n+b\n", "test")[0].files;
const nav: ReviewNav = { jumpTo: () => undefined, openFinding: () => undefined };
const request = (id: string, text: string): ChangeRequest => ({
  id,
  origin: { kind: "manual" },
  status: "done",
  messages: [
    { role: "user", text, at: "t1" },
    { role: "agent", text: "Done", at: "t2" },
  ],
  createdAt: "t",
  updatedAt: "t",
});
const comment = (body: string): DraftComment => ({
  id: "C1",
  anchor: { path: "a.ts", side: "RIGHT", line: 3 },
  origin: { kind: "manual" },
  body,
  status: "draft",
  assisting: false,
  updatedAt: "t",
  createdAt: "t",
});

test("a request annotation reads its request by id, follows up with that id, and ignores other requests", () => {
  const state: ReviewState = { ...emptyState(), requests: [request("R1", "Rename ok"), request("R2", "Other")] };
  let commits = 0;
  const { posts, setState, store } = renderSurface(
    <NavContext value={nav}>
      <Profiler id="r1" onRender={() => commits++}>
        {renderLineItem({ side: "additions", lineNumber: 1, metadata: { kind: "request", id: "R1" } }, fileDiff, { id: "diff:a.ts", type: "diff", fileDiff })}
      </Profiler>
    </NavContext>,
    state,
  );
  assert.ok(screen.getByText("Rename ok"));
  fireEvent.change(screen.getByPlaceholderText(/Not quite/), { target: { value: "Also the test" } });
  fireEvent.click(screen.getByRole("button", { name: "Reply" }));
  assert.deepEqual(posts.at(-1), { action: { type: "request.followUp", requestId: "R1", text: "Also the test" }, key: "rf-R1" });

  const before = commits;
  const current = store.get()!;
  setState({ ...current, requests: [current.requests[0], request("R2", "Changed")] });
  assert.equal(commits, before);
});

test("a comment posts with comment.post, and Post is disabled while pending or empty", () => {
  const { posts, status } = renderSurface(
    <NavContext value={nav}>
      <CommentCard comment={comment("Looks off")} />
    </NavContext>,
    emptyState(),
  );
  const postButton = () => screen.getByRole<HTMLButtonElement>("button", { name: "Post to GitHub" });
  fireEvent.click(postButton());
  assert.deepEqual(posts.at(-1), { action: { type: "comment.post", commentId: "C1" }, key: "C1" });
  act(() => status.setPending("C1", true));
  assert.equal(postButton().disabled, true);
  cleanup();
  renderSurface(
    <NavContext value={nav}>
      <CommentCard comment={comment("  ")} />
    </NavContext>,
    emptyState(),
  );
  assert.equal(postButton().disabled, true);
});
