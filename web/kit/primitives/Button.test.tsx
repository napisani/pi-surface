import { cleanup, render, screen } from "@testing-library/react";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { Badge } from "./Badge.tsx";
import { Button } from "./Button.tsx";
import { Card } from "./Card.tsx";

afterEach(cleanup);

test("Button, Badge and Card carry the class for their kind, tone or accent", () => {
  render(
    <>
      <Button kind="primary">Go</Button>
      <Badge tone="warn">careful</Badge>
      <Card accent="draft">body</Card>
    </>,
  );
  assert.match(screen.getByRole("button", { name: "Go" }).className, /\bprimary\b/);
  assert.match(screen.getByText("careful").className, /\bwarn\b/);
  assert.match(screen.getByText("body").className, /\bdraft\b/);
});
