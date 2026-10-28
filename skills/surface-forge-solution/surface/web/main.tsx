import { mountWorkflow } from "../../../../web/kit/shell.tsx";
import type { ForgeState } from "../state.ts";
import { ForgePage } from "./ForgePage.tsx";

mountWorkflow<ForgeState>({
  Page: ForgePage,
  brand: "forge",
  empty: "Questions show up here when the agent posts them.",
  loaded: () => true,
});
