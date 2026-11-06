// Comments on a document: the user selects a passage and says what to change;
// comments queue like change requests, go to the agent as a batch, and come
// back done, declined or with a question. Every workflow keeps each document's
// comments where it likes; these helpers work on whichever list they are given.
import type { Created, PatchOp } from "../host/patch.ts";
import { append, item, remove, type Ptr } from "../host/ptr.ts";
import { SurfaceError } from "../host/workflow.ts";
import type { DocAnchor } from "./docText.ts";
import type { TargetBrief } from "./opinion.ts";
import * as rounds from "./rounds.ts";

export interface DocComment extends rounds.RoundWork {
  id: string;
  anchor: DocAnchor;
  createdAt: string;
}

/** A document a workflow lets the user comment on, and maybe edit. */
export interface DocTarget<S> {
  label: string;
  markdown: string;
  comments: readonly DocComment[];
  list: Ptr<S, DocComment[]>;
  /** Where the document lives and how its author revises it. */
  brief: TargetBrief;
  /** Ops that save the user's own edit; absent for read-only documents. */
  save?(markdown: string, now: string): PatchOp[];
  /** Ops that create the comment list on a document saved before comments existed. */
  ensure?: PatchOp[];
}

const MAX_QUOTE = 2000;

function indexOf(comments: readonly DocComment[], id: string): number {
  const i = comments.findIndex((c) => c.id === id);
  if (i < 0) {
    throw new SurfaceError(`unknown comment "${id}"`);
  }
  return i;
}

/** Comment ids are unique across a workflow's documents, so a message can name one alone. */
export function nextCommentId(all: readonly DocComment[]): string {
  return `K${all.reduce((n, c) => Math.max(n, Number(c.id.slice(1)) || 0), 0) + 1}`;
}

export function addDocComment<S>(doc: DocTarget<S>, id: string, anchor: DocAnchor, text: string, now: string): Created {
  if (!anchor.quote.trim()) {
    throw new SurfaceError("select the passage to comment on");
  }
  if (anchor.quote.length > MAX_QUOTE) {
    throw new SurfaceError(`a comment covers at most ${MAX_QUOTE} characters; select less`);
  }
  if (!text.trim()) {
    throw new SurfaceError("a comment needs text");
  }
  const comment: DocComment = { id, anchor: { ...anchor }, ...rounds.newRoundWork(text, now), createdAt: now };
  return { id, ops: [...(doc.ensure ?? []), append(doc.list, comment)] };
}

export function deleteDocComment<S>(doc: DocTarget<S>, id: string): PatchOp[] {
  const comment = doc.comments[indexOf(doc.comments, id)];
  if (comment.status !== "pending" || comment.messages.length > 1) {
    throw new SurfaceError(`${id} is ${comment.status === "pending" ? "part of a conversation" : comment.status}; only an unsent comment can be deleted`);
  }
  return [remove(item(doc.list, indexOf(doc.comments, id)))];
}

export function followUpDocComment<S>(doc: DocTarget<S>, id: string, text: string, now: string): PatchOp[] {
  const i = indexOf(doc.comments, id);
  return rounds.followUpRound(item(doc.list, i), doc.comments[i], text, now, id);
}

export interface SentComments {
  ops: PatchOp[];
  sent: DocComment[];
}

/** Ops that send every pending comment on a document as one round. */
export function sendDocComments<S>(doc: DocTarget<S>): SentComments {
  if (doc.comments.some((c) => c.status === "sent")) {
    throw new SurfaceError("the agent is still working on the last batch of comments");
  }
  const pending = doc.comments.flatMap((c, i) => (c.status === "pending" ? [i] : []));
  if (!pending.length) {
    throw new SurfaceError("there are no unsent comments");
  }
  const round = doc.comments.reduce((n, c) => Math.max(n, c.round ?? 0), 0) + 1;
  return { ops: rounds.sendRound(pending.map((i) => item(doc.list, i)), round), sent: pending.map((i) => doc.comments[i]) };
}

export interface CommentUpdate extends rounds.RoundUpdate {
  commentId: string;
}

/** Ops for the agent's answer to each comment it was sent. */
export function updateDocComments<S>(doc: DocTarget<S>, updates: readonly CommentUpdate[], now: string): PatchOp[] {
  const errors: string[] = [];
  const ops: PatchOp[] = [];
  for (const u of updates) {
    const i = doc.comments.findIndex((c) => c.id === u.commentId);
    if (i < 0) {
      errors.push(`unknown comment "${u.commentId}" on ${doc.label}`);
      continue;
    }
    if (doc.comments[i].status !== "sent") {
      errors.push(`${u.commentId} was not sent to you`);
      continue;
    }
    errors.push(...rounds.checkUpdate(u, u.commentId));
    ops.push(...rounds.updateRound(item(doc.list, i), u, now));
  }
  const missed = doc.comments.filter((c) => c.status === "sent" && !updates.some((u) => u.commentId === c.id));
  if (missed.length) {
    errors.push(`answer every comment sent: ${missed.map((c) => c.id).join(", ")}`);
  }
  if (errors.length) {
    throw new SurfaceError(`invalid comment updates:\n- ${errors.join("\n- ")}`);
  }
  return ops;
}

/** The message that sends a batch of comments to the agent. */
export function commentsMessage(doc: DocTarget<unknown>, kind: string, id: string, sent: readonly DocComment[], tool: string): string {
  return [
    `comments on ${doc.label}`,
    ...sent.flatMap((c) => [`- ${c.id} on "${c.anchor.quote.length > 200 ? `${c.anchor.quote.slice(0, 200)}…` : c.anchor.quote}"`, ...c.messages.map((m) => `  ${m.role === "user" ? "user" : "you"}: ${m.text}`)]),
    "",
    `The document: ${doc.brief.content}`,
    `Revise it for each comment: ${doc.brief.revise}`,
    `Then call ${tool} once (docKind "${kind}", docId "${id}") with done, declined (say why) or needs-input (ask) and a one-line reply for every comment above.`,
  ].join("\n");
}
