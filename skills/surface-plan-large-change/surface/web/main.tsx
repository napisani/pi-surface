import { mountWorkflow } from "../../../../web/kit/shell.tsx";
import type { PlanState } from "../state.ts";
import { PlanPage } from "./PlanPage.tsx";

mountWorkflow<PlanState>({
  Page: PlanPage,
  brand: "plan",
  empty: "The plan shows up here when the agent opens one.",
  loaded: (state) => state.plan !== null,
});
