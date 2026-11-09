import type { SurfaceContext, WorkflowSession } from "../../../src/host/workflow.ts";
import { resolveAction, type EntropyAction } from "./actions.ts";
import { addThreadMessage, postFindings, reviseFinding, type EntropyState, type FindingInput, type FindingRevision } from "./state.ts";

export class EntropySession implements WorkflowSession<EntropyAction> {
  readonly #ctx: SurfaceContext<EntropyState>;

  constructor(ctx: SurfaceContext<EntropyState>) {
    this.#ctx = ctx;
  }

  get state(): EntropyState {
    return this.#ctx.store.state;
  }

  status(): string | undefined {
    if (this.state.findings.length === 0) {
      return undefined;
    }
    return `${this.state.findings.filter((f) => f.status === "open").length} open`;
  }

  /** Posts findings as one batch and returns the page URL. */
  async post(scope: string | undefined, findings: FindingInput[]): Promise<string> {
    this.#ctx.commit(postFindings(this.state, scope, findings));
    return this.#ctx.url();
  }

  reply(findingId: string, text: string, revision?: FindingRevision): void {
    const revise = revision ? reviseFinding(this.state, findingId, revision) : [];
    this.#ctx.commit([...revise, ...addThreadMessage(this.state, findingId, { role: "agent", text, at: this.#ctx.now() })]);
  }

  async handleAction(action: EntropyAction): Promise<void> {
    const { ops, message } = resolveAction(this.state, action, this.#ctx.now());
    this.#ctx.commit(ops);
    if (message) {
      this.#ctx.notifyAgent(message, action);
    }
  }
}
