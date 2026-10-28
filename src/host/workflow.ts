// The contract between the pi-surface host and a workflow module. A workflow
// knows nothing about Pi, HTTP or persistence; it sees only SurfaceContext.
import type { Static, TSchema } from "typebox";
import type { Json } from "./decode.ts";
import type { PatchOp } from "./patch.ts";
import type { Runner } from "./runner.ts";
import type { Store } from "./store.ts";

/** An expected failure: a tool error the model can fix, or a 400 the page shows. */
export class SurfaceError extends Error {}

/** The message of whatever a catch caught; JavaScript lets code throw any value. */
export function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export type WorkflowId = string;

/** What every page action has in common; the host reads nothing else of it. */
export interface SurfaceAction {
  type: string;
}

export interface SurfaceContext<S> {
  readonly store: Store<S>;
  /** Applies, persists and broadcasts the ops. */
  commit(ops: PatchOp[]): void;
  /** Wakes the agent; the host prefixes the content with "Surface · <id> · ". The action rides along as the message's details. */
  notifyAgent(content: string, action: SurfaceAction): void;
  /** This workflow's page URL. Starts the server, and opens the browser the first time. */
  url(): Promise<string>;
  now(): string;
  runner: Runner;
}

export interface WorkflowSession<A> {
  handleAction(action: A): Promise<void>;
  /** Text routes served under /<token>/<id>/r/<name>, e.g. diff and blob. */
  routes?: Record<string, (query: URLSearchParams) => Promise<string>>;
  /** The status line text, or undefined to show none. */
  status?(): string | undefined;
  close?(): Promise<void>;
}

export interface ToolOutcome {
  text: string;
  details?: unknown;
  terminate?: boolean;
}

export interface SurfaceTool<Sess> {
  name: `surface_${string}`;
  label: string;
  description: string;
  promptSnippet?: string;
  parameters: TSchema;
  /** The workflow's opening tool: always declared, and running it switches the others on. */
  opens?: true;
  run(session: Sess, params: Json): ToolOutcome | Promise<ToolOutcome>;
}

export function defineSurfaceTool<Sess, P extends TSchema>(
  tool: Omit<SurfaceTool<Sess>, "parameters" | "run"> & { parameters: P; run(session: Sess, params: Static<P>): ToolOutcome | Promise<ToolOutcome> },
): SurfaceTool<Sess> {
  // SAFETY: Pi checks params against `parameters` before it calls run, so run only sees Static<P>.
  return tool as SurfaceTool<Sess>;
}

export interface WorkflowDefinition<S, A, Sess extends WorkflowSession<A>> {
  id: WorkflowId;
  /** Shown in the page header, the status line and the index page. */
  title: string;
  emptyState(): S;
  /** Throws SurfaceError for anything the page may not ask for. */
  parseAction(body: Json): A;
  tools: SurfaceTool<Sess>[];
  create(ctx: SurfaceContext<S>): Sess;
}

// The host runs workflows of unrelated state and action types side by side and never reads S or A.
// S is invariant (create() takes a context over S), so no single known type covers every workflow.
// oxlint-disable-next-line typescript/no-explicit-any -- the host stores workflows whose S and A it never reads
export type AnyWorkflow = WorkflowDefinition<any, any, any>;

export function defineWorkflow<S, A, Sess extends WorkflowSession<A>>(definition: WorkflowDefinition<S, A, Sess>): WorkflowDefinition<S, A, Sess> {
  return definition;
}

/** One persisted batch of ops for one workflow. */
export interface OpsEntry {
  workflow: WorkflowId;
  ops: PatchOp[];
}

export const OPS_ENTRY = "surface-ops";
export const MESSAGE_TYPE = "surface";

export interface SurfaceMessageDetails {
  workflow: WorkflowId;
  action: SurfaceAction;
}
