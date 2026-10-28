import { createSurfaceHooks } from "../../../../web/kit/store.ts";
import type { PageAction } from "../actions.ts";
import type { FeedbackState } from "../state.ts";

export const { useSelect: useFeedback, usePost } = createSurfaceHooks<FeedbackState, PageAction>();
