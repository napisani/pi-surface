import { mountWorkflow } from "../../../../web/kit/shell.tsx";
import type { ReviewState } from "../state.ts";
import { ReviewPage } from "./ReviewPage.tsx";

mountWorkflow<ReviewState>({
  Page: ReviewPage,
  brand: "code review",
  empty: "Ask the agent to review your changes or a PR on the web page.",
  loaded: (s) => Boolean(s.target),
  revisionKey: (s) => (s.target ? `${s.target.worktree}@${s.target.revision}` : ""),
});
