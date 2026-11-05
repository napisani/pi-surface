// The page actions every workflow with second opinions accepts, and what each
// does to that workflow's list of opinions.
import { Type, type Static, type TProperties } from "typebox";
import type { PatchOp } from "../host/patch.ts";
import type { Ptr } from "../host/ptr.ts";
import {
  addFindingMessage,
  correctionsMessage,
  findingQuestionMessage,
  opinionOf,
  reReview,
  requestOpinion,
  reviewMessage,
  ruleOn,
  sendCorrections,
  setVerdict,
  settle,
  type Opinion,
  type OpinionTarget,
  type ReviewerChoice,
  type TargetBrief,
} from "./opinion.ts";

const Id = Type.String({ minLength: 1, maxLength: 200 });
const Text = Type.String({ minLength: 1, maxLength: 20_000 });
const action = <T extends string, P extends TProperties>(type: T, properties: P) => Type.Object({ type: Type.Literal(type), ...properties });

export const OPINION_ACTIONS = {
  "opinion.request": action("opinion.request", {
    targetKind: Id,
    targetId: Id,
    model: Id,
    prompt: Text,
    promptName: Type.Optional(Type.String({ maxLength: 200 })),
    maxPasses: Type.Optional(Type.Integer({ minimum: 1, maximum: 3 })),
  }),
  "opinion.verdict": action("opinion.verdict", { opinionId: Id, findingIds: Type.Array(Id, { minItems: 1, maxItems: 100 }), verdict: Type.Enum(["pending", "accept", "reject", "discuss"]) }),
  "opinion.send": action("opinion.send", { opinionId: Id }),
  "opinion.rule": action("opinion.rule", { opinionId: Id, findingId: Id, side: Type.Enum(["author", "reviewer"]) }),
  "opinion.reReview": action("opinion.reReview", { opinionId: Id }),
  "opinion.settle": action("opinion.settle", { opinionId: Id }),
  "opinion.ask": action("opinion.ask", { opinionId: Id, findingId: Id, text: Text }),
};

export type OpinionAction = Static<(typeof OPINION_ACTIONS)[keyof typeof OPINION_ACTIONS]>;

export const isOpinionAction = (a: { type: string }): a is OpinionAction => a.type in OPINION_ACTIONS;

/** What a workflow supplies so the kit can resolve its opinion actions. */
export interface OpinionScope<S> {
  list: Ptr<S, Opinion[]>;
  opinions: readonly Opinion[];
  /** The target a request names, or a SurfaceError when the workflow has no such thing. */
  target(kind: string, id: string): OpinionTarget;
  brief(target: OpinionTarget): TargetBrief;
  /** The workflow's tool names for findings and for corrections. */
  tools: { findings: string; update: string };
}

export interface OpinionResolution {
  ops: PatchOp[];
  message?: string;
}

/** Turns one opinion action into ops, plus the message that wakes the agent when it has work. */
export function resolveOpinionAction<S>(scope: OpinionScope<S>, action: OpinionAction, now: string): OpinionResolution {
  const { list, opinions } = scope;
  switch (action.type) {
    case "opinion.request": {
      const target = scope.target(action.targetKind, action.targetId);
      const reviewer: ReviewerChoice = { model: action.model.trim(), prompt: action.prompt.trim() };
      if (action.promptName?.trim()) {
        reviewer.promptName = action.promptName.trim();
      }
      const { id, ops } = requestOpinion(list, opinions, target, reviewer, action.maxPasses ?? 1, now);
      const opinion: Opinion = { id, target, reviewer, pass: 1, maxPasses: action.maxPasses ?? 1, status: "reviewing", findings: [], requestedAt: now, updatedAt: now };
      return { ops, message: reviewMessage(opinion, scope.brief(target), scope.tools.findings) };
    }
    case "opinion.verdict":
      return { ops: setVerdict(list, opinions, action.opinionId, action.findingIds, action.verdict, now) };
    case "opinion.send": {
      const { ops, sent } = sendCorrections(list, opinions, action.opinionId, now);
      const opinion = opinionOf(opinions, action.opinionId);
      return { ops, message: correctionsMessage(opinion, sent, scope.brief(opinion.target), scope.tools.update) };
    }
    case "opinion.rule":
      return { ops: ruleOn(list, opinions, action.opinionId, action.findingId, action.side, now) };
    case "opinion.reReview": {
      const ops = reReview(list, opinions, action.opinionId, now);
      const opinion = opinionOf(opinions, action.opinionId);
      return { ops, message: reviewMessage({ ...opinion, pass: opinion.pass + 1 }, scope.brief(opinion.target), scope.tools.findings) };
    }
    case "opinion.settle":
      return { ops: settle(list, opinions, action.opinionId, now) };
    case "opinion.ask": {
      const opinion = opinionOf(opinions, action.opinionId);
      const finding = opinion.findings.find((f) => f.id === action.findingId);
      const ops = addFindingMessage(list, opinions, action.opinionId, action.findingId, { role: "user", text: action.text.trim(), at: now });
      return { ops, message: finding ? findingQuestionMessage(opinion, finding, action.text.trim(), scope.tools.update) : undefined };
    }
  }
}
