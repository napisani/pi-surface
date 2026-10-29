// Where each feedback item is in the flow. Pure, so the Node tests cover it.
import type { Decision, FeedbackItem } from "../state.ts";

/** Where an item is in the flow; the Feedback list groups by it. */
export type Stage = "decide" | "fixing" | "reply" | "done";

export const STAGES: readonly (readonly [Stage, string])[] = [
  ["decide", "Needs a decision"],
  ["fixing", "Fixing"],
  ["reply", "Ready to reply"],
  ["done", "Done"],
];

export function stageOf(item: FeedbackItem): Stage {
  if (item.closed || item.reply?.status === "posted" || (item.source.kind === "thread" && item.source.resolved)) {
    return "done";
  }
  if (item.decision === "undecided") {
    return "decide";
  }
  if (item.decision === "fix" && item.fix && item.fix.status !== "done") {
    return "fixing";
  }
  return "reply";
}

export interface ListFilter {
  showHidden: boolean;
  showDone: boolean;
  /** Only items with this decision, or every item. */
  decision: Decision | "all";
}

/** The items the list shows, grouped by stage in the order the list draws them. */
export function listGroups(items: readonly FeedbackItem[], filter: ListFilter): { stage: Stage; label: string; items: FeedbackItem[] }[] {
  const shown = items.filter(
    (i) => (filter.showHidden || !i.hidden) && (filter.showDone || stageOf(i) !== "done") && (filter.decision === "all" || i.decision === filter.decision),
  );
  return STAGES.map(([stage, label]) => ({ stage, label, items: shown.filter((i) => stageOf(i) === stage) })).filter((g) => g.items.length);
}

/** The id j or k moves to from `current`, in list order; the first item when nothing is selected. */
export function stepFrom(order: readonly FeedbackItem[], current: string | undefined, delta: 1 | -1): string | undefined {
  if (!order.length) {
    return undefined;
  }
  const at = order.findIndex((i) => i.id === current);
  if (at < 0) {
    return order[0].id;
  }
  return order[Math.min(order.length - 1, Math.max(0, at + delta))].id;
}
