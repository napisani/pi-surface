import { Type, type Static, type TProperties } from "typebox";
import { decodeAction, trimmed, type Json } from "../../../src/host/decode.ts";
import { applyPatch, type PatchOp } from "../../../src/host/patch.ts";
import { SurfaceError } from "../../../src/host/workflow.ts";
import {
  addThreadMessage,
  awaitingApproval,
  deferQuestion,
  DRAFT_NAMES,
  openInRound,
  recordAnswer,
  reopenDecision,
  requestDraft,
  reviewDraft,
  setRfcRequested,
  type DraftKind,
  type ForgeState,
  type Question,
  type ThreadMessage,
  type Verdict,
} from "./state.ts";

const MAX_TEXT = 4000;

const Id = Type.String({ minLength: 1, maxLength: MAX_TEXT });
const Text = Type.String({ minLength: 1, maxLength: MAX_TEXT });
const OptionalText = Type.Optional(Type.String({ maxLength: MAX_TEXT }));
const Kind = Type.Enum(["spec", "rfc"]);
const action = <T extends string, P extends TProperties>(type: T, properties: P) => Type.Object({ type: Type.Literal(type), ...properties });

/** What the browser may ask for, one schema per action type. Anything else is rejected before it touches state. */
const ACTIONS = {
  answer: action("answer", { questionId: Id, optionId: Id, note: OptionalText }),
  followUp: action("followUp", { questionId: Id, optionId: Type.Optional(Type.String({ maxLength: MAX_TEXT })), text: Text }),
  defer: action("defer", { questionId: Id }),
  revisit: action("revisit", { decisionId: Id }),
  rfc: action("rfc", { requested: Type.Boolean() }),
  draft: action("draft", { kind: Kind }),
  "draft.review": action("draft.review", { kind: Kind, verdict: Type.Enum(["approve", "approveWithRfc", "changes"]), note: OptionalText }),
};

export type ForgeAction = Static<(typeof ACTIONS)[keyof typeof ACTIONS]>;

/** Decodes a browser action, then trims its text and drops blank optional fields. */
export function parseAction(body: Json): ForgeAction {
  const a = decodeAction(ACTIONS, body);
  if (a.type === "followUp") {
    a.text = a.text.trim();
    if (!a.optionId) {
      delete a.optionId;
    }
  }
  if (a.type === "answer" || a.type === "draft.review") {
    const note = a.type === "answer" ? a.note || undefined : trimmed(a.note);
    if (note === undefined) {
      delete a.note;
    } else {
      a.note = note;
    }
  }
  return a;
}

export interface AgentMessage {
  content: string;
  details: ForgeAction;
}

function questionOf(state: ForgeState, id: string): Question {
  const question = state.questions.find((q) => q.id === id);
  if (!question) {
    throw new SurfaceError(`unknown question "${id}"`);
  }
  return question;
}

const optionLabel = (question: Question, optionId: string | undefined) => question.options.find((o) => o.id === optionId)?.label ?? optionId;

function describeDecision(state: ForgeState, question: Question): string {
  const decision = state.decisions.find((d) => d.id === question.id);
  if (!decision || decision.status === "deferred") {
    return `- ${question.id} ${question.header}: deferred`;
  }
  const recommended = question.options.find((o) => o.recommended);
  let stance = "";
  if (recommended) {
    stance = recommended.id === decision.optionId ? " (your recommendation)" : `, overriding your recommendation "${recommended.label}"`;
  }
  const note = decision.note ? ` User note: ${decision.note}` : "";
  return `- ${question.id} ${question.header}: chose "${decision.label}"${stance}.${note}`;
}

function describeStatus(state: ForgeState, question: Question): string {
  return question.status === "open" ? `- ${question.id} ${question.header}: open` : describeDecision(state, question);
}

/** The agent-facing request for a draft of the design as it stands. */
export function draftRequest(state: ForgeState, kind: DraftKind): string {
  const name = DRAFT_NAMES[kind];
  const lines = state.questions.map((q) => describeStatus(state, q));
  return [
    `draft requested: ${name}.`,
    `Write the ${name} now from the decisions below, in its usual format. Write every section you can.`,
    `Where a section depends on an open or deferred decision, write TBD(D4): what is missing, naming the decision ids. Where it depends on a decision not asked yet, write TBD: what is missing.`,
    `Post it with surface_forge_draft (kind "${kind}"), then end your turn. This answers no question; open questions stay open.`,
    "",
    "Decisions so far:",
    ...(lines.length ? lines : ["- none yet"]),
  ].join("\n");
}

/** The agent-facing summary of every decision in a completed round. */
export function roundSummary(state: ForgeState, round: number): string {
  const lines = state.questions.filter((q) => q.round === round).map((q) => describeDecision(state, q));
  return `round ${round} complete:\n${lines.join("\n")}\n\nPost the next frontier round with surface_forge_ask when ready.`;
}

/** The agent-facing message for the user's verdict on a final draft. */
export function reviewMessage(after: ForgeState, kind: DraftKind, verdict: Verdict, note: string | undefined): string {
  const name = DRAFT_NAMES[kind];
  if (verdict === "changes") {
    return `${name} changes requested: ${note}\n\nRevise the file${after.drafts[kind]?.path ? ` at ${after.drafts[kind]!.path}` : ""}, then post it again with surface_forge_draft (kind "${kind}", final true). Then end your turn.`;
  }
  const waiting = awaitingApproval(after);
  if (verdict === "approveWithRfc") {
    return `${name} approved; the user also wants an RFC. Run any RFC-only questions still open with surface_forge_ask, then write the RFC and post it with surface_forge_draft (kind "rfc", final true).`;
  }
  if (waiting.length) {
    return `${name} approved. Still awaiting approval: ${waiting.map((k) => DRAFT_NAMES[k]).join(", ")}.`;
  }
  const paths = (["spec", "rfc"] satisfies DraftKind[]).flatMap((k) => (after.drafts[k]?.path ? [`${DRAFT_NAMES[k]}: ${after.drafts[k]!.path}`] : []));
  return `${name} approved. Every draft is approved; the session is done. Close by stating each draft's path${paths.length ? ` (${paths.join("; ")})` : ""}.`;
}

/**
 * Turns one browser action into state changes plus, when the agent should
 * act, the message that wakes it. Answers and defers produce a message only
 * once they complete their round. Throws SurfaceError for invalid actions.
 */
/** What one browser action does: state changes and, when the agent should act, the message that wakes it. */
export interface Resolution {
  ops: PatchOp[];
  message?: AgentMessage;
}

export function resolveAction(state: ForgeState, action: ForgeAction, now: string): Resolution {
  switch (action.type) {
    case "answer":
    case "defer": {
      const question = questionOf(state, action.questionId);
      const ops = action.type === "answer" ? recordAnswer(state, action.questionId, action.optionId, action.note, now) : deferQuestion(state, action.questionId, now);
      // One agent turn per round: hold answers until the round is complete.
      if (openInRound(state, question.round, question.id).length > 0) {
        return { ops };
      }
      const after = applyPatch(structuredClone(state), ops);
      return { ops, message: { content: roundSummary(after, question.round), details: action } };
    }
    case "followUp": {
      const question = questionOf(state, action.questionId);
      const message: ThreadMessage = { role: "user", text: action.text, at: now };
      if (action.optionId) {
        message.optionId = action.optionId;
      }
      const ops = addThreadMessage(state, action.questionId, message);
      const about = action.optionId ? ` about option "${optionLabel(question, action.optionId)}"` : "";
      return {
        ops,
        message: {
          content: `follow-up · ${question.id} ${question.header}${about}:\n${action.text}\n\nThis is a question, not an answer; ${question.id} stays open. Reply with surface_forge_reply (questionId "${question.id}"), revising the option there if your answer changes it.`,
          details: action,
        },
      };
    }
    case "revisit": {
      const question = questionOf(state, action.decisionId);
      const previous = state.decisions.find((d) => d.id === action.decisionId)?.label;
      return {
        ops: reopenDecision(state, action.decisionId),
        message: {
          content: `revisit · ${question.id} ${question.header} reopened (was "${previous}"). Decisions that depended on it need review. Re-ask it with surface_forge_ask using id "${question.id}".`,
          details: action,
        },
      };
    }
    case "rfc": {
      const ops = setRfcRequested(state, action.requested);
      if (!ops.length) {
        return { ops };
      }
      const content = action.requested
        ? "RFC requested: write an RFC alongside the tech spec. Add the RFC's extra ground to upcoming rounds. Open questions stay open; nothing to reply."
        : "RFC withdrawn: write only the tech spec. Open questions stay open; nothing to reply.";
      return { ops, message: { content, details: action } };
    }
    case "draft":
      return { ops: requestDraft(state, action.kind, now), message: { content: draftRequest(state, action.kind), details: action } };
    case "draft.review": {
      const ops = reviewDraft(state, action.kind, action.verdict, action.note, now);
      const after = applyPatch(structuredClone(state), ops);
      return { ops, message: { content: reviewMessage(after, action.kind, action.verdict, action.note), details: action } };
    }
  }
}
