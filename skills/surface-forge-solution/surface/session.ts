import type { PatchOp } from "../../../src/host/patch.ts";
import type { SpecDimension } from "../../../src/kit/options.ts";
import type { SurfaceContext, WorkflowSession } from "../../../src/host/workflow.ts";
import { applyOpinionUpdate, postFindings, type FindingInput, type OpinionUpdate } from "../../../src/kit/opinion.ts";
import type { OpinionSession } from "../../../src/kit/opinionTools.ts";
import { createEditReporter, type EditReporter } from "../../../src/kit/docEdits.ts";
import { updateDocComments, type CommentUpdate } from "../../../src/kit/docComments.ts";
import type { DocSession } from "../../../src/kit/docTools.ts";
import { resolveAction, type ForgeAction } from "./actions.ts";
import { addThreadMessage, draftDoc, opinionsPtr, postDraft, postRound, reviseOption, setRfcRequested, type DraftKind, type ForgeState, type OptionRevision, type QuestionInput, type ThreadMessage } from "./state.ts";

export class ForgeSession implements WorkflowSession<ForgeAction>, OpinionSession, DocSession {
  readonly #ctx: SurfaceContext<ForgeState>;
  readonly #edits: EditReporter<ForgeAction>;

  constructor(ctx: SurfaceContext<ForgeState>) {
    this.#ctx = ctx;
    this.#edits = createEditReporter((content, action) => ctx.inform(content, action));
  }

  answerDocComments(kind: string, id: string, updates: CommentUpdate[]): void {
    this.#commit(updateDocComments(draftDoc(this.state, kind, id), updates, this.#ctx.now()));
  }

  async close(): Promise<void> {
    this.#edits.flush();
  }

  get state(): ForgeState {
    return this.#ctx.store.state;
  }

  #commit(ops: PatchOp[]): void {
    this.#ctx.commit(ops);
  }

  status(): string | undefined {
    if (this.state.questions.length === 0) {
      return undefined;
    }
    return `${this.state.questions.filter((q) => q.status === "open").length} open`;
  }

  /** Posts questions as one round and returns the page URL. */
  async askRound(questions: QuestionInput[], specDimensions: SpecDimension[] = []): Promise<string> {
    this.#commit(postRound(this.state, questions, specDimensions));
    return this.#ctx.url();
  }

  reply(questionId: string, text: string, optionId?: string, revision?: OptionRevision): void {
    const revise = optionId && revision ? reviseOption(this.state, questionId, optionId, revision) : [];
    const entry: ThreadMessage = { role: "agent", text, at: this.#ctx.now() };
    if (optionId) {
      entry.optionId = optionId;
    }
    const message = addThreadMessage(this.state, questionId, entry);
    this.#commit([...revise, ...message]);
  }

  /** Records an RFC request the user made outside the page, without waking the agent. */
  setRfcRequested(requested: boolean): void {
    this.#commit(setRfcRequested(this.state, requested));
  }

  /** Shows a draft on the Overview, recording which decisions it reflects. */
  postDraft(kind: DraftKind, markdown: string, options: { final?: boolean; path?: string } = {}): void {
    this.#commit(postDraft(this.state, kind, markdown, this.#ctx.now(), options));
  }

  postOpinionFindings(opinionId: string, input: { findings: FindingInput[]; summary?: string; runId?: string } | { failed: string }): void {
    this.#commit(postFindings(opinionsPtr, this.state.opinions, opinionId, input, this.#ctx.now()));
  }

  updateOpinion(opinionId: string, update: OpinionUpdate): void {
    this.#commit(applyOpinionUpdate(opinionsPtr, this.state.opinions, opinionId, update, this.#ctx.now()));
  }

  async handleAction(action: ForgeAction): Promise<void> {
    const { ops, message, edited } = resolveAction(this.state, action, this.#ctx.now());
    this.#commit(ops);
    if (edited) {
      const file = edited.path ? `The page's text is now the draft; write it to ${edited.path} so the file matches.` : "";
      this.#edits.edited(edited.key, edited, action, file);
    }
    if (message) {
      this.#ctx.notifyAgent(message.content, message.details);
    }
  }
}
