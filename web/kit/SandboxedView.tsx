// An agent-built interactive view. The iframe runs without same-origin access
// and under a no-network policy (see src/kit/sandbox.ts), so the view can
// reach neither this page, its token, nor the server.
import { useEffect, useMemo, useRef, useState } from "react";
import { Type } from "typebox";
import { Value } from "typebox/value";
import { sandboxDocument, VIEW_DATA, VIEW_HEIGHT } from "../../src/kit/sandbox.ts";
import css from "./SandboxedView.module.css";

const MAX_HEIGHT = 1600;
const sizers = new Map<MessageEventSource, (height: number) => void>();
let listening = false;

const HeightMessage = Type.Object({ type: Type.Literal(VIEW_HEIGHT), height: Type.Number() });

/** One window listener for every view; each message is routed by the frame it came from and checked before use. */
function onViewMessage(event: MessageEvent) {
  const resize = event.source ? sizers.get(event.source) : undefined;
  if (resize && Value.Check(HeightMessage, event.data)) {
    resize(event.data.height);
  }
}

export function SandboxedView({ html, data, height = 360 }: { html: string; data?: unknown; height?: number }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [size, setSize] = useState(height);
  const doc = useMemo(() => sandboxDocument(html), [html]);
  useEffect(() => {
    const win = frame.current?.contentWindow;
    if (!win) {
      return;
    }
    if (!listening) {
      window.addEventListener("message", onViewMessage);
      listening = true;
    }
    sizers.set(win, (h) => setSize(Math.min(Math.max(Math.ceil(h), 80), MAX_HEIGHT)));
    return () => {
      sizers.delete(win);
    };
  }, [doc]);
  const send = () => frame.current?.contentWindow?.postMessage({ type: VIEW_DATA, data: data ?? null }, "*");
  useEffect(send, [data]);
  return (
    <div className={css.wrap}>
      <iframe ref={frame} className={css.frame} title="agent-built view" sandbox="allow-scripts" srcDoc={doc} style={{ height: size }} onLoad={send} />
      <div className={css.note}>Agent-built view · sandboxed, no network</div>
    </div>
  );
}
