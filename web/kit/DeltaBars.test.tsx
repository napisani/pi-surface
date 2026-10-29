import assert from "node:assert/strict";
import { test } from "node:test";
import { deltaColor } from "./DeltaBars.tsx";

test("a move is green when it is a gain on that dimension and red when it is a cost", () => {
  const cost = { id: "downtime", label: "Migration downtime" };
  const benefit = { id: "coverage", label: "Test coverage", direction: "benefit" as const };
  assert.equal(deltaColor(cost, 2), "var(--rose)");
  assert.equal(deltaColor(cost, -1), "var(--green)");
  assert.equal(deltaColor(benefit, 2), "var(--green)");
  assert.equal(deltaColor(benefit, -1), "var(--rose)");
  assert.equal(deltaColor(benefit, 0), "var(--faint)");
});
