import { useEffect, useRef, useState } from "react";
import { useCommands } from "./keyboardContext.ts";
import { useDraft } from "./store.ts";
import { Button } from "./primitives/Button.tsx";
import css from "./AgentComposer.module.css";

/** Captured before focusing the editor, so a selection cannot change the request's scope. */
export interface AgentTarget {
  key: string;
  label: string;
  reference: string;
  ask(text: string): Promise<boolean>;
  edit?(text: string): Promise<boolean>;
  onSent?(mode: "ask" | "edit"): void;
}

interface OpenComposer {
  target: AgentTarget;
  mode: "ask" | "edit";
  append: string;
  serial: number;
}

function Composer({ opened, onClose }: { opened: OpenComposer; onClose(): void }) {
  const { target, mode } = opened;
  const [text, setText] = useDraft(`agent:${target.key}:${mode}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const applied = useRef(-1);
  useEffect(() => {
    if (applied.current !== opened.serial) {
      applied.current = opened.serial;
      if (opened.append) {
        setText(text ? `${text}\n\n${opened.append}` : opened.append);
      }
      input.current?.focus();
    }
  }, [opened, text, setText]);
  const submit = async () => {
    if (busy || !text.trim()) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const send = mode === "edit" ? target.edit : target.ask;
      if (send && await send(text.trim())) {
        setText("");
        onClose();
        requestAnimationFrame(() => target.onSent?.(mode));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };
  const submitLabel = mode === "edit" ? "Queue change request" : "Send question";
  return (
    <section className={css.composer} aria-label="Agent composer">
      <header><strong>{mode === "edit" ? "Request change" : "Ask agent"}</strong><span>{target.label}</span></header>
      <small>{target.reference} · staged locally until you submit</small>
      <textarea ref={input} disabled={busy} aria-label="Agent prompt" rows={5} value={text} onChange={(event) => setText(event.target.value)} />
      {error ? <p role="alert">{error}</p> : null}
      <footer><Button disabled={busy} onClick={onClose}>Hide · keep draft</Button><Button disabled={busy || !text.trim()} kind="primary" onClick={() => void submit()}>{busy ? "Sending…" : submitLabel}</Button></footer>
    </section>
  );
}

/** Workflow-blind staged composition; commands open or append, never send. */
export function AgentComposer({ id, prepare, editable = false }: { id: string; prepare(): AgentTarget | undefined; editable?: boolean }) {
  const [opened, setOpened] = useState<OpenComposer | null>(null);
  const serial = useRef(0);
  const open = (mode: "ask" | "edit", append: "" | "question" | "instruction" | "reference" = "") => {
    const target = prepare();
    if (!target || (mode === "edit" && !target.edit)) {
      return;
    }
    const addition = { "": "", reference: target.reference, question: `${target.reference}\nQuestion: `, instruction: `${target.reference}\nInstruction: ` }[append];
    setOpened({ target, mode, append: addition, serial: ++serial.current });
  };
  useCommands([
    { id: `${id}.ask`, label: "Ask about current context", keys: ["<leader>v?"], run: () => open("ask") },
    { id: `${id}.compose`, label: "Focus agent composer", keys: ["<leader>ai"], run: () => open("ask") },
    { id: `${id}.stageQuestion`, label: "Stage a question", keys: ["<leader>a?"], run: () => open("ask", "question") },
    { id: `${id}.stageReference`, label: "Append context reference", keys: ["<leader>aff"], run: () => open("ask", "reference") },
    { id: `${id}.edit`, label: "Request a scoped edit", keys: ["<leader>ve"], disabled: editable ? undefined : "This context is read-only", run: () => open("edit") },
    { id: `${id}.stageInstruction`, label: "Stage an edit instruction", keys: ["<leader>ae"], disabled: editable ? undefined : "This context is read-only", run: () => open("edit", "instruction") },
  ]);
  return opened ? <Composer key={`${opened.target.key}:${opened.mode}`} opened={opened} onClose={() => setOpened(null)} /> : null;
}
