import { cleanup, screen } from "@testing-library/react";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import type { RoundStatus, RoundWork } from "../../src/kit/rounds.ts";
import { renderSurface } from "../../test/web/surface.tsx";
import { RoundThread } from "./RoundThread.tsx";

afterEach(cleanup);

const work = (status: RoundStatus): RoundWork => ({
  status,
  messages: [{ role: "user", text: "Rename ok", at: "t1" }, ...(status === "pending" || status === "sent" ? [] : [{ role: "agent" as const, text: "Done", at: "t2" }])],
});

const props = { onSave: async () => true, onCancel: () => undefined, followKey: "f", onFollowUp: async () => true };

test("a pending batch being edited shows its last message in a textarea", () => {
  renderSurface(<RoundThread work={work("pending")} editing {...props} />, {});
  assert.equal(screen.getByRole<HTMLTextAreaElement>("textbox").value, "Rename ok");
});

test("sent work shows the working line and no follow-up row", () => {
  renderSurface(<RoundThread work={work("sent")} editing={false} {...props} />, {});
  assert.ok(screen.getByText(/working on this batch/));
  assert.equal(screen.queryByRole("textbox"), null);
});

for (const status of ["done", "declined", "needs-input"] as const) {
  test(`${status} work shows the follow-up row`, () => {
    renderSurface(<RoundThread work={work(status)} editing={false} {...props} />, {});
    assert.ok(screen.getByRole("button", { name: status === "needs-input" ? "Answer" : "Reply" }));
  });
}
