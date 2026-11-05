import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { useState } from "react";
import { DEFAULT_KEYBINDINGS } from "../../src/kit/keybindings.ts";
import { renderSurface } from "../../test/web/surface.tsx";
import { AgentComposer } from "./AgentComposer.tsx";
import { Keyboard } from "./keyboard.ts";
import { useCommands } from "./keyboardContext.ts";
import { KeyboardOverlay } from "./KeyboardOverlay.tsx";
import { KeyboardProvider } from "./KeyboardProvider.tsx";
import { KeyboardScope } from "./KeyboardScope.tsx";
import { AskRow } from "./primitives/AskRow.tsx";

const press = (keys: string) => { for (const key of keys) { fireEvent.keyDown(document.body, { key }); } };
afterEach(cleanup);

function Commands({ onRun }: { onRun(): void }) {
  useCommands([{ id: "test.run", label: "Run the test command", keys: ["<leader>r", "]g"], run: onRun }]);
  return <input aria-label="Draft" />;
}

test("semicolon sequences execute, while inputs, contenteditable, IME and modifiers remain isolated", () => {
  let calls = 0;
  render(<KeyboardProvider config={DEFAULT_KEYBINDINGS}><Commands onRun={() => calls++} /><div contentEditable aria-label="Editor" /></KeyboardProvider>);
  press(";r");
  assert.equal(calls, 1);
  const input = screen.getByRole("textbox", { name: "Draft" });
  fireEvent.change(input, { target: { value: "just typing;" } });
  for (const target of [input, screen.getByLabelText("Editor")]) {
    for (const key of [";", "r", "]", "g", "j", "k"]) { fireEvent.keyDown(target, { key }); }
  }
  fireEvent.keyDown(document.body, { key: ";", isComposing: true });
  fireEvent.keyDown(document.body, { key: "r" });
  fireEvent.keyDown(document.body, { key: ";", ctrlKey: true });
  fireEvent.keyDown(document.body, { key: "r" });
  assert.equal(calls, 1);
  act(() => input.focus());
  fireEvent.keyDown(input, { key: "Escape" });
  assert.equal(document.activeElement, document.body);
  assert.equal(screen.getByDisplayValue("just typing;"), input);
  press("]g");
  assert.equal(calls, 2);
});

test("CSS-hidden scopes register nothing and current callbacks are used", () => {
  const seen: string[] = [];
  const view = render(<KeyboardProvider config={DEFAULT_KEYBINDINGS}><KeyboardScope name="files" active={false}><Commands onRun={() => seen.push("hidden")} /></KeyboardScope></KeyboardProvider>);
  press("]g");
  assert.equal(seen.length, 0);
  view.rerender(<KeyboardProvider config={DEFAULT_KEYBINDINGS}><KeyboardScope name="files" active><Commands onRun={() => seen.push("old")} /></KeyboardScope></KeyboardProvider>);
  view.rerender(<KeyboardProvider config={DEFAULT_KEYBINDINGS}><KeyboardScope name="files" active><Commands onRun={() => seen.push("new")} /></KeyboardScope></KeyboardProvider>);
  press("]g");
  assert.deepEqual(seen, ["new"]);
});

test("focus, Escape, hash changes and window blur cancel a partial sequence", () => {
  let calls = 0;
  render(<KeyboardProvider config={DEFAULT_KEYBINDINGS}><Commands onRun={() => calls++} /></KeyboardProvider>);
  for (const cancel of [() => fireEvent.keyDown(document.body, { key: "Escape" }), () => fireEvent.focusIn(screen.getByRole("textbox")), () => fireEvent(window, new Event("hashchange")), () => fireEvent(window, new Event("blur"))]) {
    press(";");
    cancel();
    press("r");
  }
  assert.equal(calls, 0);
});

test("fuzzy picker owns Enter and arrows; typed semicolons never invoke page commands", () => {
  let calls = 0;
  render(<KeyboardProvider config={DEFAULT_KEYBINDINGS}><Commands onRun={() => calls++} /></KeyboardProvider>);
  press(";fk");
  const input = screen.getByRole("textbox", { name: "Fuzzy filter" });
  assert.equal(document.activeElement, input);
  fireEvent.change(input, { target: { value: "rttc" } });
  fireEvent.keyDown(input, { key: ";" });
  assert.equal(calls, 0);
  fireEvent.keyDown(input, { key: "Enter" });
  assert.equal(calls, 1);
  assert.equal(screen.queryByRole("dialog"), null);
});

test("which-key appears after the hint delay, not an execution timeout", async () => {
  const keyboard = new Keyboard();
  render(<KeyboardProvider config={DEFAULT_KEYBINDINGS} engine={keyboard}><Commands onRun={() => undefined} /></KeyboardProvider>);
  press(";");
  assert.equal(keyboard.get().hints, false);
  await act(async () => new Promise((resolve) => setTimeout(resolve, 280)));
  assert.equal(keyboard.get().hints, true);
  assert.ok(screen.getByRole("button", { name: /r Run the test command/ }));
  fireEvent.keyDown(document.body, { key: "Escape" });
  assert.equal(keyboard.get().hints, false);
});

function Drafts() {
  const [step, setStep] = useState("one");
  return <><button onClick={() => setStep(step === "one" ? "two" : "one")}>Next</button><AskRow key={step} placeholder={step} pendingKey={step} onSend={async () => false} /></>;
}

test("AskRow drafts survive keyed unmounts and failed sends", async () => {
  renderSurface(<Drafts />, {});
  fireEvent.change(screen.getByPlaceholderText("one"), { target: { value: "keep this" } });
  fireEvent.click(screen.getByText("Next"));
  fireEvent.change(screen.getByPlaceholderText("two"), { target: { value: "second" } });
  fireEvent.click(screen.getByText("Next"));
  assert.ok(screen.getByDisplayValue("keep this"));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Ask" })));
  assert.ok(screen.getByDisplayValue("keep this"));
});

test("staging never sends; composer keeps drafts and posts only on explicit submit", async () => {
  const sent: string[] = [];
  renderSurface(<KeyboardProvider config={DEFAULT_KEYBINDINGS}><AgentComposer id="test.agent" prepare={() => ({ key: "file", label: "a.ts", reference: "@a.ts:1-2", ask: async (text) => { sent.push(text); return true; } })} /></KeyboardProvider>, {});
  press(";aff");
  assert.ok(screen.getByDisplayValue("@a.ts:1-2"));
  assert.deepEqual(sent, []);
  const input = screen.getByRole("textbox", { name: "Agent prompt" });
  fireEvent.change(input, { target: { value: "why this?" } });
  fireEvent.keyDown(input, { key: "Escape" });
  fireEvent.click(screen.getByRole("button", { name: "Hide · keep draft" }));
  press(";ai");
  assert.ok(screen.getByDisplayValue("why this?"));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Send question" })));
  assert.deepEqual(sent, ["why this?"]);
});

test("the keyboard error banner can be dismissed, and a different error shows again", () => {
  const keyboard = new Keyboard();
  keyboard.configure(DEFAULT_KEYBINDINGS, "Cannot load keybindings (404)");
  render(<KeyboardOverlay keyboard={keyboard} />);
  assert.match(screen.getByRole("alert").textContent ?? "", /Cannot load keybindings \(404\)/);
  fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
  assert.equal(screen.queryByRole("alert"), null);
  act(() => keyboard.configure(DEFAULT_KEYBINDINGS, "bad binding"));
  assert.match(screen.getByRole("alert").textContent ?? "", /bad binding/);
});
