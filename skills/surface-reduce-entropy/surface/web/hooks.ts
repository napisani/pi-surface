import { createSurfaceHooks } from "../../../../web/kit/store.ts";
import type { EntropyAction } from "../actions.ts";
import type { EntropyState } from "../state.ts";

export const { useSelect: useEntropy, usePost } = createSurfaceHooks<EntropyState, EntropyAction>();
