import { applyPatch, type PatchOp } from "./patch.ts";
import type { Runner } from "./runner.ts";
import { startSurfaceServer, type ServedWorkflow, type SurfaceServer } from "./server.ts";
import { Store } from "./store.ts";
import { SurfaceError, type AnyWorkflow, type OpsEntry, type SurfaceAction, type SurfaceContext, type WorkflowDefinition, type WorkflowId, type WorkflowSession } from "./workflow.ts";

/** What the Pi wiring supplies to the host; tests fake it. */
export interface SurfaceHost {
  /** Durably records one batch so resume can replay it. */
  persist(entry: OpsEntry): void;
  /** Delivers a page event to the agent, starting a turn if it is idle. */
  notifyAgent(workflow: WorkflowId, content: string, action: SurfaceAction): void;
  /** Called after every change, e.g. to refresh a status line. */
  changed?(workflow: WorkflowId): void;
  /** Called the first time a workflow's page URL is handed out. */
  opened?(url: string): void;
  now?(): string;
  runner: Runner;
}

export interface TypedRunning<S, Sess> {
  session: Sess;
  store: Store<S>;
}

export interface Running extends ServedWorkflow {
  session: WorkflowSession<unknown>;
}

/**
 * Runs every workflow for one session: their stores, sessions and the one
 * server. State is rebuilt from the persisted batches at construction.
 */
export class Surface {
  readonly workflows = new Map<WorkflowId, Running>();
  #host: SurfaceHost;
  #webRoot: string;
  #server: Promise<SurfaceServer> | undefined;
  #opened = new Set<WorkflowId>();
  #touched = new Set<WorkflowId>();

  constructor(host: SurfaceHost, definitions: AnyWorkflow[], webRoot: string, entries: OpsEntry[] = []) {
    this.#host = host;
    this.#webRoot = webRoot;
    for (const definition of definitions) {
      if (this.workflows.has(definition.id)) {
        throw new Error(`duplicate workflow id "${definition.id}"`);
      }
      const state = definition.emptyState();
      for (const entry of entries) {
        if (entry.workflow !== definition.id) {
          continue;
        }
        applyPatch(state, entry.ops);
        this.#touched.add(definition.id);
      }
      const store = new Store<unknown>(state);
      const session = definition.create(this.#context(definition.id, store));
      this.workflows.set(definition.id, { definition, store, session, hasState: () => this.#touched.has(definition.id) });
    }
  }

  #now(): string {
    return this.#host.now?.() ?? new Date().toISOString();
  }

  #context(id: WorkflowId, store: Store<unknown>): SurfaceContext<unknown> {
    return {
      store,
      commit: (ops: PatchOp[]) => {
        if (!ops.length) {
          return;
        }
        store.apply(ops);
        this.#host.persist({ workflow: id, ops });
        this.#touched.add(id);
        this.#host.changed?.(id);
      },
      notifyAgent: (content, action) => this.#host.notifyAgent(id, content, action),
      url: async () => {
        const url = await this.url(id);
        if (!this.#opened.has(id)) {
          this.#opened.add(id);
          this.#host.opened?.(url);
        }
        return url;
      },
      now: () => this.#now(),
      runner: this.#host.runner,
    };
  }

  running(id: WorkflowId): Running {
    const running = this.workflows.get(id);
    if (!running) {
      throw new SurfaceError(`unknown workflow "${id}"`);
    }
    return running;
  }

  /** A workflow's session and store, typed by the definition that made them. */
  typed<S, A, Sess extends WorkflowSession<A>>(definition: WorkflowDefinition<S, A, Sess>): TypedRunning<S, Sess> {
    const running = this.running(definition.id);
    // SAFETY: the constructor made this session with definition.create and seeded the store with definition.emptyState().
    return { session: running.session as Sess, store: running.store as Store<S> };
  }

  hasState(id: WorkflowId): boolean {
    return this.#touched.has(id);
  }

  /** The index page, or a workflow's page. Starts the server on first use. */
  async url(id?: WorkflowId): Promise<string> {
    if (id !== undefined) {
      this.running(id);
    }
    if (!this.#server) {
      this.#server = startSurfaceServer({ workflows: this.workflows, webRoot: this.#webRoot });
      this.#server.catch(() => (this.#server = undefined));
    }
    const base = (await this.#server).url;
    return id === undefined ? base : `${base}${id}/`;
  }

  async close(): Promise<void> {
    const server = this.#server;
    this.#server = undefined;
    await Promise.all([...this.workflows.values()].map((running) => running.session.close?.()));
    if (server) {
      await (await server).close();
    }
  }
}
