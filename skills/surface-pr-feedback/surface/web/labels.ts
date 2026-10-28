import type { Rev } from "../../../../src/kit/code.ts";
import type { Level } from "../../../../src/kit/levels.ts";
import type { Tone } from "../../../../web/kit/primitives/Badge.tsx";
import type { Decision, Recommendation, SourceKind } from "../state.ts";

export const KIND = {
  thread: { icon: "💬", label: "review thread" },
  review: { icon: "📝", label: "review summary" },
  conversation: { icon: "🗨", label: "PR comment" },
  chat: { icon: "✎", label: "from chat" },
} satisfies Record<SourceKind, { icon: string; label: string }>;

export const DECISION_LABEL = { undecided: "Undecided", fix: "Fix", respond: "Respond only", skip: "Skip" } satisfies Record<Decision, string>;
export const RECOMMENDATION_TONE = { fix: "amber", respond: "info", skip: "muted" } satisfies Record<Recommendation, Tone>;
export const DECISION_TONE = { fix: "amberFill", respond: "info", skip: "muted" } satisfies Record<Recommendation, Tone>;
export const REV_LABEL = { base: "merge base", head: "PR head", since: "when opened", work: "working tree" } satisfies Record<Rev, string>;

export const short = (l: Level) => l[0];
