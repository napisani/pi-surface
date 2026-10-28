import { mountWorkflow } from "../../../../web/kit/shell.tsx";
import type { FeedbackState } from "../state.ts";
import { FeedbackPage } from "./FeedbackPage.tsx";

mountWorkflow<FeedbackState>({
  Page: FeedbackPage,
  brand: "pr feedback",
  empty: "Ask the agent to open your PR's feedback.",
  loaded: (s) => Boolean(s.target),
  revisionKey: (s) => (s.target ? `${s.target.worktree}@${s.target.revision}` : ""),
});
