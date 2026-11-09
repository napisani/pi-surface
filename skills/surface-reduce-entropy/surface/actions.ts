import { Type, type Static } from "typebox";
import { decodeAction, trimmed, type Json } from "../../../src/host/decode.ts";
import type { PatchOp } from "../../../src/host/patch.ts";
import { SurfaceError } from "../../../src/host/workflow.ts";
import { addThreadMessage, CONCESSION_LABEL, decide, ordered, reopen, submit, type EntropyState, type Finding } from "./state.ts";

const MAX_TEXT = 4000;
const Id = Type.String({ minLength: 1, maxLength: MAX_TEXT });

/** What the browser may ask for, one schema per action type. Anything else is rejected before it touches state. */
const ACTIONS = {
  decide: Type.Object({ type: Type.Literal("decide"), findingId: Id, verdict: Type.Enum(["accept", "decline"]), note: Type.Optional(Type.String({ maxLength: MAX_TEXT })) }),
  reopen: Type.Object({ type: Type.Literal("reopen"), findingId: Id }),
  submit: Type.Object({ type: Type.Literal("submit") }),
  followUp: Type.Object({ type: Type.Literal("followUp"), findingId: Id, text: Type.String({ minLength: 1, maxLength: MAX_TEXT }) }),
};

export type EntropyAction = Static<(typeof ACTIONS)[keyof typeof ACTIONS]>;

/** Decodes a browser action, then trims its text and drops a blank note. */
export function parseAction(body: Json): EntropyAction {
  const a = decodeAction(ACTIONS, body);
  if (a.type === "followUp") {
    a.text = a.text.trim();
    if (!a.text) {
      throw new SurfaceError("a follow-up needs text");
    }
  }
  if (a.type === "decide") {
    const note = trimmed(a.note);
    if (note === undefined) {
      delete a.note;
    } else {
      a.note = note;
    }
  }
  return a;
}

function describe(f: Finding): string {
  const head = `- ${f.id} ${f.title} (${CONCESSION_LABEL[f.concession]})`;
  if (f.status === "open") {
    return `${head}: open`;
  }
  const verdict = f.status === "accepted" ? "accept" : "decline";
  const stance = verdict === f.recommended ? " (your recommendation)" : `, overriding your recommendation to ${f.recommended}`;
  return `${head}: ${f.status}${stance}.${f.note ? ` User note: ${f.note}` : ""}`;
}

/** The agent-facing summary the user sends once no finding is left open. */
export function decisionsSummary(state: EntropyState): string {
  return [
    "decisions sent:",
    ...ordered(state.findings).map(describe),
    "",
    "Post any findings that waited on these decisions with surface_entropy_findings. Otherwise the review is settled.",
  ].join("\n");
}

export interface Resolution {
  ops: PatchOp[];
  message?: string;
}

/**
 * Turns one browser action into state changes plus, when the agent should
 * act, the message that wakes it. Decisions stay on the page until the user
 * sends them. Throws SurfaceError for invalid actions.
 */
export function resolveAction(state: EntropyState, action: EntropyAction, now: string): Resolution {
  switch (action.type) {
    case "decide":
      return { ops: decide(state, action.findingId, action.verdict, action.note) };
    case "submit":
      return { ops: submit(state), message: decisionsSummary(state) };
    case "reopen":
      return { ops: reopen(state, action.findingId) };
    case "followUp": {
      const ops = addThreadMessage(state, action.findingId, { role: "user", text: action.text, at: now });
      const finding = state.findings.find((f) => f.id === action.findingId)!;
      return {
        ops,
        message: `follow-up · ${finding.id} ${finding.title}:\n${action.text}\n\nThis is a question, not a decision; ${finding.id} stays as it is. Reply with surface_entropy_reply (findingId "${finding.id}"), revising the finding there if your answer changes it.`,
      };
    }
  }
}
