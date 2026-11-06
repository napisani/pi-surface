// A document the user reads, edits and comments on, like a Notion page:
// markdown stays the source of truth, diagrams render inline, and comments on
// a passage go to the agent as a batch. Built on Milkdown Crepe, loaded lazily.
import "@milkdown/kit/prose/view/style/prosemirror.css";
import "@milkdown/kit/prose/tables/style/tables.css";
import "@milkdown/kit/prose/gapcursor/style/gapcursor.css";
import "prosemirror-virtual-cursor/style/virtual-cursor.css";
import "@milkdown/crepe/theme/common/reset.css";
import "@milkdown/crepe/theme/common/block-edit.css";
import "@milkdown/crepe/theme/common/code-mirror.css";
import "@milkdown/crepe/theme/common/cursor.css";
import "@milkdown/crepe/theme/common/link-tooltip.css";
import "@milkdown/crepe/theme/common/list-item.css";
import "@milkdown/crepe/theme/common/placeholder.css";
import "@milkdown/crepe/theme/common/table.css";
import "@milkdown/crepe/theme/common/toolbar.css";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DocAction } from "../../src/kit/docActions.ts";
import type { DocComment } from "../../src/kit/docComments.ts";
import type { DocAnchor } from "../../src/kit/docText.ts";
import { ChatThread } from "./ChatThread.tsx";
import { cx } from "./cx.ts";
import { Badge, ROUND_TONE } from "./primitives/Badge.tsx";
import { Button } from "./primitives/Button.tsx";
import { Segmented } from "./primitives/Segmented.tsx";
import { Working } from "./primitives/Working.tsx";
import type { DocEditor } from "./richdoc/editor.ts";
import { createPreviews } from "./richdoc/preview.tsx";
import css from "./RichDoc.module.css";
import { ROUND_LABEL } from "./RoundThread.tsx";
import { createSurfaceHooks, usePending } from "./store.ts";
import { AskRow } from "./primitives/AskRow.tsx";

const { usePost } = createSurfaceHooks<unknown, DocAction>();

const SAVE_MS = 700;
/** Typing within this long blocks an agent revision from replacing the text under the cursor. */
const TYPING_MS = 2000;
const MODES = [
  { id: "read", label: "Read" },
  { id: "edit", label: "Edit" },
] as const;

/** What the editor holds that the server may not have yet. */
interface LocalText {
  markdown: string;
  typedAt: number;
  timer: ReturnType<typeof setTimeout> | undefined;
  /** Only Edit mode saves: the editor also reports changes when it normalizes markdown it was given. */
  editing: boolean;
  /** The editor's own serialization when editing began, so the agent hears only what the user changed. */
  base: string;
}

export interface RichDocProps {
  doc: { kind: string; id: string; label: string };
  markdown: string;
  /** The document's comments; omit to turn commenting off. */
  comments?: readonly DocComment[];
  /** Offers an Edit mode whose changes save into the document. */
  editable?: boolean;
}

function CommentCard({ comment: c, doc, active, onFocus }: { comment: DocComment; doc: RichDocProps["doc"]; active: boolean; onFocus(): void }) {
  const post = usePost();
  const answered = c.status === "done" || c.status === "declined" || c.status === "needs-input";
  const key = `doc-follow:${c.id}`;
  return (
    <div className={cx(css.card, active && css.active, (c.status === "done" || c.status === "declined") && css.settled)} onClick={onFocus}>
      <div className={css.cardHead}>
        <b className={css.id}>{c.id}</b>
        <Badge mini tone={ROUND_TONE[c.status]}>
          {ROUND_LABEL[c.status]}
        </Badge>
        {c.status === "pending" && c.messages.length === 1 ? (
          <button type="button" className={css.x} title="Delete" onClick={() => void post({ type: "doc.comment.delete", docKind: doc.kind, docId: doc.id, commentId: c.id })}>
            ×
          </button>
        ) : null}
      </div>
      <blockquote className={css.quote}>{c.anchor.quote.length > 160 ? `${c.anchor.quote.slice(0, 160)}…` : c.anchor.quote}</blockquote>
      <ChatThread messages={c.messages} waiting={c.status === "sent" ? "the agent is revising…" : null} />
      {answered ? <AskRow placeholder="Reply" label="Reply" pendingKey={key} onSend={(text) => post({ type: "doc.comment.followUp", docKind: doc.kind, docId: doc.id, commentId: c.id, text }, key)} /> : null}
    </div>
  );
}

function Composer({ anchor, doc, onDone }: { anchor: DocAnchor; doc: RichDocProps["doc"]; onDone(): void }) {
  const post = usePost();
  const [text, setText] = useState("");
  const busy = usePending("doc-comment");
  const send = async () => {
    if (text.trim() && (await post({ type: "doc.comment", docKind: doc.kind, docId: doc.id, anchor, text }, "doc-comment"))) {
      onDone();
    }
  };
  return (
    <div className={cx(css.card, css.active)}>
      <blockquote className={css.quote}>{anchor.quote.length > 160 ? `${anchor.quote.slice(0, 160)}…` : anchor.quote}</blockquote>
      <textarea autoFocus rows={3} placeholder="What should change here?" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => (e.key === "Enter" && (e.metaKey || e.ctrlKey) ? void send() : undefined)} />
      <div className={css.row}>
        <Button size="small" kind="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button size="small" kind="primary" disabled={busy || !text.trim()} onClick={() => void send()}>
          Comment
        </Button>
      </div>
    </div>
  );
}

export function RichDoc({ doc, markdown, comments, editable = false }: RichDocProps) {
  const post = usePost();
  const host = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const editor = useRef<DocEditor | null>(null);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<"read" | "edit">("read");
  const [active, setActive] = useState<string>();
  const [draft, setDraft] = useState<DocAnchor | null>(null);
  const [offer, setOffer] = useState<{ anchor: DocAnchor; top: number; left: number } | null>(null);
  const [stale, setStale] = useState(false);
  const local = useRef<LocalText>({ markdown, typedAt: 0, timer: undefined, editing: false, base: markdown });
  const sending = usePending(`doc-send:${doc.kind}:${doc.id}`);

  // Built once per document; later markdown and mode changes go through the effects below.
  useEffect(() => {
    let alive = true;
    const pending = local.current;
    const previews = createPreviews();
    const save = (next: string) => {
      if (!pending.editing) {
        return;
      }
      pending.markdown = next;
      pending.typedAt = Date.now();
      clearTimeout(pending.timer);
      pending.timer = setTimeout(() => void post({ type: "doc.edit", docKind: doc.kind, docId: doc.id, markdown: next, base: pending.base }), SAVE_MS);
    };
    void import("./richdoc/editor.ts").then(async ({ createDocEditor }) => {
      if (!alive || !host.current) {
        return;
      }
      previews.attach(host.current);
      const made = await createDocEditor(host.current, { markdown, readonly: true, onChange: save, onHighlight: setActive, preview: previews.preview });
      if (!alive) {
        void made.destroy();
        return;
      }
      editor.current = made;
      setReady(true);
    });
    return () => {
      alive = false;
      clearTimeout(pending.timer);
      void editor.current?.destroy();
      editor.current = null;
      previews.dispose();
    };
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- the editor is built once per document; markdown and mode flow in through the effects below
  }, [doc.kind, doc.id]);

  useEffect(() => {
    const made = editor.current;
    if (!made) {
      return;
    }
    local.current.editing = mode === "edit";
    if (mode === "edit") {
      local.current.base = made.getMarkdown();
    }
    made.setReadonly(mode === "read");
  }, [mode, ready]);

  useEffect(() => {
    if (!editor.current || markdown === local.current.markdown) {
      return;
    }
    if (Date.now() - local.current.typedAt < TYPING_MS) {
      setStale(true);
      return;
    }
    local.current.markdown = markdown;
    editor.current.setMarkdown(markdown);
    setStale(false);
  }, [markdown, ready]);

  const open = useMemo(() => (comments ?? []).filter((c) => c.status !== "done" && c.status !== "declined"), [comments]);
  useEffect(() => {
    editor.current?.setHighlights((comments ?? []).map((c) => ({ id: c.id, anchor: c.anchor, active: c.id === active || (c.status !== "done" && c.status !== "declined") })));
  }, [comments, active, ready]);

  const offerComment = () => {
    if (!comments || !editor.current || !frame.current) {
      return;
    }
    const picked = editor.current.selection();
    if (!picked) {
      setOffer(null);
      return;
    }
    const box = frame.current.getBoundingClientRect();
    setOffer({ anchor: picked.anchor, top: picked.rect.top - box.top - 34, left: Math.min(picked.rect.left - box.left, box.width - 120) });
  };
  const focus = (id: string) => {
    setActive(id);
    const rect = editor.current?.highlightRect(id);
    if (rect && (rect.top < 80 || rect.bottom > window.innerHeight)) {
      window.scrollBy({ top: rect.top - window.innerHeight / 3, behavior: "smooth" });
    }
  };
  const unsent = open.filter((c) => c.status === "pending").length;
  return (
    <div className={cx(css.wrap, comments && css.withComments)}>
      <div className={css.bar}>
        {editable ? <Segmented options={MODES} value={mode} onChange={setMode} /> : null}
        <span className={css.hint}>{comments ? "Select text to comment." : ""}</span>
        {stale ? (
          <Button
            size="small"
            onClick={() => {
              local.current.markdown = markdown;
              editor.current?.setMarkdown(markdown);
              setStale(false);
            }}
          >
            The agent revised this; load it
          </Button>
        ) : null}
        {unsent ? (
          <Button size="small" kind="primary" disabled={sending} onClick={() => void post({ type: "doc.comments.send", docKind: doc.kind, docId: doc.id }, `doc-send:${doc.kind}:${doc.id}`)}>
            Send {unsent} comment{unsent > 1 ? "s" : ""} to the agent
          </Button>
        ) : null}
      </div>
      <div className={css.body}>
        <div ref={frame} className={css.frame} onMouseUp={offerComment} onKeyUp={offerComment}>
          {ready ? null : <Working>Loading the editor…</Working>}
          <div ref={host} className={cx(css.doc, mode === "edit" && css.editing)} />
          {offer ? (
            <button
              type="button"
              className={css.offer}
              style={{ top: offer.top, left: offer.left }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setDraft(offer.anchor);
                setOffer(null);
              }}
            >
              💬 Comment
            </button>
          ) : null}
        </div>
        {comments ? (
          <aside className={css.margin} aria-label={`Comments on ${doc.label}`}>
            {draft ? <Composer anchor={draft} doc={doc} onDone={() => setDraft(null)} /> : null}
            {comments.map((c) => (
              <CommentCard key={c.id} comment={c} doc={doc} active={c.id === active} onFocus={() => focus(c.id)} />
            ))}
            {comments.length || draft ? null : <p className={css.empty}>No comments yet.</p>}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
