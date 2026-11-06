// Fenced blocks that render as pictures inside a document: mermaid,
// wireframes, and the kit's structured visuals written as JSON.
import { createRoot, type Root } from "react-dom/client";
import { validateVisual, type Visual } from "../../../src/kit/code.ts";
import { Mermaid } from "../Mermaid.tsx";
import { VisualBody } from "../VisualBody.tsx";
import { WireframeView } from "../WireframeView.tsx";

/** Fence languages for the structured kinds, lowercased as editors report them. */
const JSON_KINDS = new Map<string, Visual["kind"]>([
  ["graph", "graph"],
  ["matrix", "matrix"],
  ["statemachine", "stateMachine"],
  ["archdiff", "archDiff"],
  ["heatmap", "heatmap"],
]);

/** The visual a fenced block draws, or an error saying why it cannot. */
export function fenceVisual(language: string, content: string): Visual | { error: string } | null {
  if (language === "mermaid") {
    return { kind: "mermaid", source: content };
  }
  if (language === "wireframe") {
    return { kind: "wireframe", source: content };
  }
  const kind = JSON_KINDS.get(language);
  if (!kind) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    return { error: `${kind}: not valid JSON (${error instanceof Error ? error.message : String(error)})` };
  }
  if (!(parsed instanceof Object) || Array.isArray(parsed)) {
    return { error: `${kind}: expected a JSON object` };
  }
  // SAFETY: validateVisual below checks every part this kind needs before it is drawn.
  const visual = { ...parsed, kind } as Visual;
  const problems = validateVisual(visual, kind);
  return problems.length ? { error: problems.join("; ") } : visual;
}

export interface Previews {
  /** Placeholder markup for a fenced block, or null to show its code. */
  preview(language: string, content: string): string | null;
  /** Mounts each placeholder once the editor puts it in the page, and unmounts ones it removes. */
  attach(root: HTMLElement): void;
  dispose(): void;
}

function render(root: Root, visual: Visual | { error: string }): void {
  if ("error" in visual) {
    root.render(<pre className="surface-doc-preview-error">{visual.error}</pre>);
  } else if (visual.kind === "mermaid") {
    root.render(<Mermaid source={visual.source} />);
  } else if (visual.kind === "wireframe") {
    root.render(<WireframeView source={visual.source} />);
  } else {
    root.render(<VisualBody visual={visual} />);
  }
}

/**
 * The code-block view sanitizes a preview and copies it in as HTML, so a
 * rendered element would arrive as a dead snapshot. It gets a placeholder
 * instead, and React mounts into the placeholder once it is in the page.
 */
export function createPreviews(): Previews {
  const pending = new Map<string, Visual | { error: string }>();
  const mounted = new Map<Element, Root>();
  let next = 0;
  let observer: MutationObserver | undefined;
  const sweep = (root: HTMLElement) => {
    for (const [element, reactRoot] of mounted) {
      if (!element.isConnected) {
        reactRoot.unmount();
        mounted.delete(element);
      }
    }
    for (const element of root.querySelectorAll<HTMLElement>("[data-surface-preview]")) {
      const visual = pending.get(element.dataset.surfacePreview ?? "");
      if (visual && !mounted.has(element)) {
        const reactRoot = createRoot(element);
        mounted.set(element, reactRoot);
        render(reactRoot, visual);
      }
    }
  };
  return {
    preview(language, content) {
      const visual = fenceVisual(language, content);
      if (!visual) {
        return null;
      }
      const id = `p${next++}`;
      pending.set(id, visual);
      return `<div class="surface-doc-preview" data-surface-preview="${id}"></div>`;
    },
    attach(root) {
      observer = new MutationObserver(() => sweep(root));
      observer.observe(root, { childList: true, subtree: true });
      sweep(root);
    },
    dispose() {
      observer?.disconnect();
      for (const reactRoot of mounted.values()) {
        reactRoot.unmount();
      }
      mounted.clear();
      pending.clear();
    },
  };
}
