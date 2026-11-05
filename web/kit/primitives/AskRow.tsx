import type { RefObject } from "react";
import { useDraft, usePending } from "../store.ts";
import { Button } from "./Button.tsx";
import css from "./AskRow.module.css";
import { Row } from "./Row.tsx";

export interface AskRowProps {
  placeholder: string;
  /** Pending key of the action this posts; the button disables while it is in flight. */
  pendingKey: string;
  label?: string;
  initial?: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  onSend: (text: string) => Promise<boolean>;
}

/** A one-line input and button, for questions, follow-ups and instructions. Clears on success. */
export function AskRow({ placeholder, pendingKey, label = "Ask", initial = "", onSend, inputRef }: AskRowProps) {
  const [text, setText] = useDraft(`ask:${pendingKey}`, initial);
  const busy = usePending(pendingKey);
  const send = async () => {
    const trimmed = text.trim();
    if (!busy && trimmed && (await onSend(trimmed))) {
      setText("");
    }
  };
  return (
    <Row className={css.ask}>
      <input ref={inputRef} placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && !e.repeat && void send()} />
      <Button disabled={busy} onClick={() => void send()}>
        {label}
      </Button>
    </Row>
  );
}
