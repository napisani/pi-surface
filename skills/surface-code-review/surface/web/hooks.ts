import { createSurfaceHooks } from "../../../../web/kit/store.ts";
import type { PageAction } from "../actions.ts";
import type { ReviewState } from "../state.ts";
import type { Mode } from "./lineItems.ts";

export const { useSelect: useReview, useReadState: useReadReview, usePost } = createSurfaceHooks<ReviewState, PageAction>();

const selectMode = (s: ReviewState): Mode => s.target?.mode ?? "pinned";
const selectGithub = (s: ReviewState) => s.pr !== null;

export const useMode = () => useReview(selectMode);
export const useLive = () => useReview(selectMode) === "live";
/** True when the review is of a GitHub PR, so comments can be posted. */
export const useGithub = () => useReview(selectGithub);
