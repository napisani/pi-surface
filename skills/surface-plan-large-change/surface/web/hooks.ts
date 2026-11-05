import { createSurfaceHooks } from "../../../../web/kit/store.ts";
import type { PlanAction } from "../actions.ts";
import type { Plan, PlanState } from "../state.ts";

export const { useSelect: usePlanState, usePost } = createSurfaceHooks<PlanState, PlanAction>();

const selectPlan = (s: PlanState) => s.plan;
const selectReadOnly = (s: PlanState) => s.readOnly;

/** The open plan; the page mounts only once one is loaded. */
export function usePlan(): Plan {
  const plan = usePlanState(selectPlan);
  if (!plan) {
    throw new Error("the plan page rendered before a plan was loaded");
  }
  return plan;
}

export const useReadOnly = () => usePlanState(selectReadOnly);
