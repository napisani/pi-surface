// The Milkdown Crepe editor behind RichDoc, kept free of React so the page
// loads it only when a document is shown. Markdown stays the source of truth.
import { Crepe } from "@milkdown/crepe";
import { editorViewCtx } from "@milkdown/kit/core";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet, type EditorView } from "@milkdown/kit/prose/view";
import { $prose, replaceAll } from "@milkdown/kit/utils";
import { anchorAt, findAnchor, type DocAnchor } from "../../../src/kit/docText.ts";

export interface Highlight {
  id: string;
  anchor: DocAnchor;
  active: boolean;
}

export interface DocEditorOptions {
  markdown: string;
  readonly: boolean;
  onChange(markdown: string): void;
  onHighlight(id: string): void;
  /** Preview markup for a fenced block's language, or null to show the code. */
  preview(language: string, content: string): string | null;
}

export interface DocEditor {
  /** The document as the editor serializes it, which can differ in spacing from what it was given. */
  getMarkdown(): string;
  setMarkdown(markdown: string): void;
  setReadonly(readonly: boolean): void;
  setHighlights(highlights: readonly Highlight[]): void;
  /** The selected passage as an anchor, or null when nothing in the document is selected. */
  selection(): { anchor: DocAnchor; rect: DOMRect } | null;
  /** Where a highlight sits, to scroll to it. */
  highlightRect(id: string): DOMRect | null;
  destroy(): Promise<void>;
}

/** The document's text, with each character's document position (-1 for a block break). */
interface TextIndex {
  text: string;
  pos: number[];
}

function textIndex(doc: ProseNode): TextIndex {
  let text = "";
  const pos: number[] = [];
  doc.descendants((node, at) => {
    if (node.isText) {
      for (let i = 0; i < node.text!.length; i++) {
        text += node.text![i];
        pos.push(at + i);
      }
    } else if (node.isBlock && text && !text.endsWith("\n")) {
      text += "\n";
      pos.push(-1);
    }
    return true;
  });
  return { text, pos };
}

interface HighlightState {
  highlights: readonly Highlight[];
  set: DecorationSet;
}

const highlightKey = new PluginKey<HighlightState>("surface-comments");

function decorate(doc: ProseNode, highlights: readonly Highlight[]): DecorationSet {
  const { text, pos } = textIndex(doc);
  const decorations = highlights.flatMap((h) => {
    const found = findAnchor(text, h.anchor);
    if (!found) {
      return [];
    }
    const from = pos.slice(found[0], found[1]).find((p) => p >= 0);
    const last = pos.slice(found[0], found[1]).findLast((p) => p >= 0);
    return from === undefined || last === undefined ? [] : [Decoration.inline(from, last + 1, { class: h.active ? "surface-comment surface-comment-active" : "surface-comment", "data-comment": h.id })];
  });
  return DecorationSet.create(doc, decorations);
}

const highlights = (onHighlight: (id: string) => void) =>
  $prose(
    () =>
      new Plugin<HighlightState>({
        key: highlightKey,
        state: {
          init: (_, state): HighlightState => ({ highlights: [], set: DecorationSet.create(state.doc, []) }),
          apply(tr, value, _old, state): HighlightState {
            const next: readonly Highlight[] | undefined = tr.getMeta(highlightKey);
            if (next) {
              return { highlights: next, set: decorate(state.doc, next) };
            }
            return tr.docChanged ? { highlights: value.highlights, set: decorate(state.doc, value.highlights) } : value;
          },
        },
        props: {
          decorations: (state) => highlightKey.getState(state)?.set,
          handleClick(_view, _pos, event) {
            const id = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>("[data-comment]")?.dataset.comment : undefined;
            if (id) {
              onHighlight(id);
            }
            return false;
          },
        },
      }),
  );

export async function createDocEditor(root: HTMLElement, options: DocEditorOptions): Promise<DocEditor> {
  const crepe = new Crepe({
    root,
    defaultValue: options.markdown,
    features: { [Crepe.Feature.Latex]: false, [Crepe.Feature.AI]: false, [Crepe.Feature.ImageBlock]: false, [Crepe.Feature.TopBar]: false },
    featureConfigs: {
      [Crepe.Feature.CodeMirror]: {
        previewOnlyByDefault: true,
        renderPreview: (language: string, content: string) => options.preview(language.toLowerCase(), content),
      },
    },
  });
  crepe.editor.use(highlights(options.onHighlight));
  // Programmatic replaceAll fires the same listener; the flag keeps an agent's revision from echoing back as a user edit.
  let applying = false;
  crepe.on((listener) => listener.markdownUpdated((_ctx, markdown) => (applying ? undefined : options.onChange(markdown))));
  await crepe.create();
  crepe.setReadonly(options.readonly);
  const view = (): EditorView => crepe.editor.ctx.get(editorViewCtx);
  return {
    getMarkdown: () => crepe.getMarkdown(),
    setMarkdown(markdown) {
      if (markdown === crepe.getMarkdown()) {
        return;
      }
      applying = true;
      try {
        crepe.editor.action(replaceAll(markdown, true));
      } finally {
        applying = false;
      }
    },
    setReadonly: (readonly) => void crepe.setReadonly(readonly),
    setHighlights(list) {
      const v = view();
      v.dispatch(v.state.tr.setMeta(highlightKey, list));
    },
    selection() {
      const dom = window.getSelection();
      if (!dom || dom.isCollapsed || !dom.rangeCount) {
        return null;
      }
      const range = dom.getRangeAt(0);
      const v = view();
      if (!v.dom.contains(range.startContainer) || !v.dom.contains(range.endContainer)) {
        return null;
      }
      const from = v.posAtDOM(range.startContainer, range.startOffset);
      const to = v.posAtDOM(range.endContainer, range.endOffset);
      const { text, pos } = textIndex(v.state.doc);
      const start = pos.findIndex((p) => p >= from);
      const end = pos.findLastIndex((p) => p >= 0 && p < to) + 1;
      if (start < 0 || end <= start) {
        return null;
      }
      return { anchor: anchorAt(text, start, end), rect: range.getBoundingClientRect() };
    },
    highlightRect: (id) => view().dom.querySelector<HTMLElement>(`[data-comment="${CSS.escape(id)}"]`)?.getBoundingClientRect() ?? null,
    destroy: async () => void (await crepe.destroy()),
  };
}
