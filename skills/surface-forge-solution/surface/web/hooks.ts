import { createSurfaceHooks } from "../../../../web/kit/store.ts";
import type { ForgeAction } from "../actions.ts";
import type { ForgeState } from "../state.ts";

export const { useSelect: useForge, usePost } = createSurfaceHooks<ForgeState, ForgeAction>();
