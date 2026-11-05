import { setHashValues } from "../../../../web/kit/hooks/useHashState.ts";

export type Tab = "map" | "decide" | "arch" | "slices" | "docs";
export const TABS: readonly Tab[] = ["map", "decide", "arch", "slices", "docs"];

/** Opens a node on the Decision tab. */
export const openNode = (id: string) => setHashValues({ tab: "decide", node: id });
