// Review page state the server never sees, shared by tabs that are far apart.
import { createValueStore } from "../../../../web/kit/valueStore.ts";
import { NO_FILTERS, type Composer, type FileFilters } from "./lineItems.ts";

/** A new comment, request or question being written in the diff, before the server has it. */
export const composerStore = createValueStore<Composer | null>(null);
export const filterStore = createValueStore<FileFilters>(NO_FILTERS);
export const collapsedStore = createValueStore<ReadonlySet<string>>(new Set());
