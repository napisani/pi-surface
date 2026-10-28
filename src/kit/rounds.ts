// Work the user queues on the page and sends to the agent in batches (change
// requests, fixes). Each piece keeps its thread: the last user message is what
// to do now, and the agent answers each round with an outcome.
import type { PatchOp } from "../host/patch.ts";
import { add, append, child, item, replace, type Ptr } from "../host/ptr.ts";
import { SurfaceError } from "../host/workflow.ts";
import type { ThreadMessage } from "./thread.ts";

export type RoundStatus = "pending" | "sent" | "done" | "declined" | "needs-input";
export const OUTCOMES = ["done", "declined", "needs-input"] as const;
export type RoundOutcome = (typeof OUTCOMES)[number];

export interface RoundWork {
  status: RoundStatus;
  messages: ThreadMessage[];
  /** The send round that last carried this work. */
  round?: number;
}

/** Ops that send a batch of work to the agent, the round number it goes out as, and the ids in it. */
export interface SentRound {
  ops: PatchOp[];
  round: number;
  ids: string[];
}

export interface RoundUpdate {
  status: RoundOutcome;
  reply: string;
}

export function newRoundWork(text: string, now: string): RoundWork {
  return { status: "pending", messages: [{ role: "user", text: text.trim(), at: now }] };
}

/** Ops that send each pending work in one round. */
export function sendRound<S>(works: Ptr<S, RoundWork>[], round: number): PatchOp[] {
  return works.flatMap((p) => [replace(child(p, "status"), "sent"), add(child(p, "round"), round)]);
}

/** Ops that take sent work back to pending, so it can be edited and sent again. */
export function recallRound<S>(works: { p: Ptr<S, RoundWork>; work: RoundWork }[]): PatchOp[] {
  return works.flatMap(({ p, work }) => (work.status === "sent" ? [replace(child(p, "status"), "pending")] : []));
}

/** Ops that rewrite pending work's instruction; it is always the last user message. */
export function editRoundText<S>(p: Ptr<S, RoundWork>, work: RoundWork, text: string, label: string): PatchOp[] {
  if (work.status !== "pending") {
    throw new SurfaceError(`${label} is ${work.status}; only pending work can be edited`);
  }
  return [replace(child(item(child(p, "messages"), work.messages.length - 1), "text"), text.trim())];
}

/** Ops that answer the agent's outcome, putting the work back in the next round. */
export function followUpRound<S>(p: Ptr<S, RoundWork>, work: RoundWork, text: string, now: string, label: string): PatchOp[] {
  if (work.status === "pending" || work.status === "sent") {
    throw new SurfaceError(`${label} is ${work.status}; wait for the agent's reply before following up`);
  }
  return [append(child(p, "messages"), { role: "user", text: text.trim(), at: now }), replace(child(p, "status"), "pending")];
}

/** Ops that record the agent's outcome for one piece of work. */
export function updateRound<S>(p: Ptr<S, RoundWork>, update: RoundUpdate, now: string): PatchOp[] {
  return [append(child(p, "messages"), { role: "agent", text: update.reply.trim(), at: now }), replace(child(p, "status"), update.status)];
}

/** Problems with an outcome the agent reported, or none. */
export function checkUpdate(update: RoundUpdate, label: string): string[] {
  const errors: string[] = [];
  if (!OUTCOMES.includes(update.status)) {
    errors.push(`${label}: status must be done, declined or needs-input`);
  }
  if (!update.reply?.trim()) {
    errors.push(`${label}: needs a reply`);
  }
  return errors;
}
