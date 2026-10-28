import type mermaidApi from "mermaid";
import { useEffect, useRef, useState } from "react";
import css from "./Mermaid.module.css";

type MermaidApi = typeof mermaidApi;
let loading: Promise<MermaidApi> | null = null;
let diagrams = 0;

// Loaded on first use: mermaid is the largest dependency and most pages never draw a diagram.
function loadMermaid(): Promise<MermaidApi> {
  loading ??= import("mermaid").then(({ default: m }) => {
    m.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "base",
      // Kanagawa dragon, to sit with the kanagawa-dragon diffs.
      themeVariables: {
        darkMode: true,
        background: "#12120f",
        primaryColor: "#1d1c19",
        primaryTextColor: "#c5c9c5",
        primaryBorderColor: "#625e5a",
        lineColor: "#a6a69c",
        textColor: "#c5c9c5",
        actorBkg: "#1d1c19",
        actorBorder: "#625e5a",
        actorTextColor: "#c5c9c5",
        signalColor: "#a6a69c",
        signalTextColor: "#c5c9c5",
        noteBkgColor: "#282727",
        noteTextColor: "#c5c9c5",
        noteBorderColor: "#8992a7",
        labelBoxBkgColor: "#1d1c19",
        labelTextColor: "#c5c9c5",
        loopTextColor: "#8992a7",
        attributeBackgroundColorOdd: "#181616",
        attributeBackgroundColorEven: "#1d1c19",
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: "13px",
      },
    });
    return m;
  });
  return loading;
}

export function Mermaid({ source }: { source: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendered, setRendered] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    loadMermaid()
      .then((m) => m.render(`mer-${diagrams++}`, source))
      .then(({ svg }) => {
        if (!current || !host.current) {
          return;
        }
        // mermaid's strict security level sanitizes the SVG it returns.
        host.current.innerHTML = svg;
        setRendered(source);
        setError(null);
      })
      .catch((e: Error) => current && setError(e.message));
    return () => {
      current = false;
    };
  }, [source]);
  return (
    <>
      {error !== null ? <pre className={css.error}>{`${error}\n\n${source}`}</pre> : null}
      {rendered !== source && error === null ? <span className={css.pending}>rendering diagram…</span> : null}
      <div ref={host} className={css.mermaid} hidden={error !== null} />
    </>
  );
}
