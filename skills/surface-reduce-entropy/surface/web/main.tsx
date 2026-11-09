import { mountWorkflow } from "../../../../web/kit/shell.tsx";
import type { EntropyState } from "../state.ts";
import { EntropyPage } from "./EntropyPage.tsx";

mountWorkflow<EntropyState>({
  Page: EntropyPage,
  brand: "entropy",
  empty: "Findings show up here when the agent posts them.",
  loaded: (state) => state.findings.length > 0,
});
