import { useState } from "react";
import css from "./AssistBox.module.css";
import { Button } from "./primitives/Button.tsx";
import { Row } from "./primitives/Row.tsx";

/** Quick instructions plus a free-text one for the agent. */
export function AssistBox({ asks, placeholder, onSend, onClose }: { asks: readonly string[]; placeholder: string; onSend(instruction: string): void; onClose(): void }) {
  const [text, setText] = useState("");
  const send = (instruction: string) => {
    if (instruction.trim()) {
      onSend(instruction.trim());
    }
  };
  return (
    <div className={css.assist}>
      <div className={css.chips}>
        {asks.map((ask) => (
          <button key={ask} type="button" className={css.chip} onClick={() => send(ask)}>
            {ask}
          </button>
        ))}
      </div>
      <Row>
        <input className={css.input} placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send(text)} />
        <Button onClick={onClose}>Cancel</Button>
        <Button kind="primary" onClick={() => send(text)}>
          Ask agent
        </Button>
      </Row>
    </div>
  );
}
