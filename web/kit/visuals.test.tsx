import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { PRESET_PROMPTS, type Opinion } from "../../src/kit/opinion.ts";
import { VIEW_POLICY } from "../../src/kit/sandbox.ts";
import { renderSurface } from "../../test/web/surface.tsx";
import { GraphView } from "./GraphView.tsx";
import { MatrixView } from "./MatrixView.tsx";
import { SandboxedView } from "./SandboxedView.tsx";
import { SecondOpinion } from "./SecondOpinion.tsx";
import { StateMachineView } from "./StateMachineView.tsx";
import { WireframeView } from "./WireframeView.tsx";

afterEach(cleanup);

test("a graph node is a button only when the graph takes clicks", () => {
  const clicked: string[] = [];
  const graph = { nodes: [{ id: "N1", label: "Where does metering run?" }, { id: "N2", label: "Storage" }], edges: [{ from: "N1", to: "N2" }] };
  render(<GraphView graph={graph} onNode={(id) => clicked.push(id)} />);
  fireEvent.click(screen.getByRole("button", { name: "Storage" }));
  assert.deepEqual(clicked, ["N2"]);
  cleanup();
  render(<GraphView graph={graph} />);
  assert.equal(screen.queryAllByRole("button").length, 0);
});

test("clicking a matrix column sorts rows by it, and again restores the order", () => {
  render(<MatrixView rows={["A", "B", "C"]} columns={["Cost"]} cells={[[{ value: "30" }], [{ value: "5" }], [{ value: "12", tone: "bad" }]]} />);
  const order = () => screen.getAllByRole("rowheader").map((h) => h.textContent);
  assert.deepEqual(order(), ["A", "B", "C"]);
  fireEvent.click(screen.getByRole("button", { name: /Cost/ }));
  assert.deepEqual(order(), ["B", "A", "C"], "numbers sort ascending, bad tones last");
  fireEvent.click(screen.getByRole("button", { name: /Cost/ }));
  assert.deepEqual(order(), ["A", "B", "C"]);
});

test("a state machine steps through events and can reset", () => {
  render(
    <StateMachineView
      states={[{ id: "in", label: "received", initial: true }, { id: "lost", label: "unmetered", bad: true }]}
      transitions={[{ from: "in", to: "lost", event: "auth fails", bad: true }]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "auth fails" }));
  assert.ok(screen.getByText("In unmetered. Fire:"));
  assert.ok(screen.getByText("auth fails → unmetered"));
  fireEvent.click(screen.getByRole("button", { name: "Reset" }));
  assert.ok(screen.getByText("In received. Fire:"));
});

test("a broken wireframe shows its errors instead of a drawing", () => {
  render(<WireframeView source={'title\nbutton "Go"'} />);
  assert.ok(screen.getByText('line 1: title needs a "quoted label"'));
});

test("an agent-built view runs sandboxed without same-origin, under the no-network policy", () => {
  const { container } = render(<SandboxedView html="<p>hi</p>" />);
  const frame = container.querySelector("iframe")!;
  assert.equal(frame.getAttribute("sandbox"), "allow-scripts");
  assert.ok(frame.getAttribute("srcdoc")!.includes(VIEW_POLICY));
});

const opinion = (status: Opinion["status"]): Opinion => ({
  id: "O1",
  target: { kind: "node", id: "N1", label: "N1" },
  reviewer: { model: "openai-codex/gpt-6-luna", prompt: "p", promptName: "Skeptic" },
  pass: 1,
  maxPasses: 2,
  status,
  findings: [
    { id: "O1.1", severity: "High", claim: "No tenant ids at the edge", pass: 1, verdict: "accept", thread: [] },
    { id: "O1.2", severity: "Low", claim: "Retries not shown", pass: 1, verdict: "pending", thread: [] },
  ],
  requestedAt: "t",
  updatedAt: "t",
});

test("a second opinion is requested with the chosen model and prompt, then triaged and sent back", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify(["openai-codex/gpt-6-luna", "claude-bridge/claude-sonnet-5-5"]));
  const target = { kind: "node", id: "N1", label: "N1" };
  const { posts } = renderSurface(<SecondOpinion target={target} opinions={[]} defaults={{ model: "claude-bridge/claude-sonnet-5-5", prompts: [] }} />, {});
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Ask for a second opinion" })));
  assert.deepEqual(posts.at(-1)?.action, { type: "opinion.request", targetKind: "node", targetId: "N1", model: "claude-bridge/claude-sonnet-5-5", prompt: PRESET_PROMPTS[0].text, promptName: PRESET_PROMPTS[0].name, maxPasses: 1 });
  cleanup();

  const triage = renderSurface(<SecondOpinion target={target} opinions={[opinion("triage")]} defaults={{ model: null, prompts: [] }} />, {});
  assert.equal(screen.queryByRole("button", { name: /Send/ }), null, "nothing goes back while a finding is untriaged");
  fireEvent.click(screen.getAllByRole("button", { name: "Reject" })[1]);
  assert.deepEqual(triage.posts.at(-1)?.action, { type: "opinion.verdict", opinionId: "O1", findingIds: ["O1.2"], verdict: "reject" });
  cleanup();

  const ready = renderSurface(<SecondOpinion target={target} opinions={[{ ...opinion("triage"), findings: opinion("triage").findings.map((f) => ({ ...f, verdict: f.verdict === "pending" ? "reject" : f.verdict })) }]} defaults={{ model: null, prompts: [] }} />, {});
  fireEvent.click(screen.getByRole("button", { name: "Send 1 to the author" }));
  assert.deepEqual(ready.posts.at(-1)?.action, { type: "opinion.send", opinionId: "O1" });
});
