import { randomBytes } from "node:crypto";
import { join } from "node:path";
import type { PatchOp } from "../../../src/host/patch.ts";
import { add, at, remove, replace } from "../../../src/host/ptr.ts";
import { checkWorktree } from "../../../src/kit/git.ts";
import { SurfaceError, type SurfaceContext, type WorkflowSession } from "../../../src/host/workflow.ts";
import { applyOpinionUpdate, postFindings, type FindingInput, type OpinionUpdate } from "../../../src/kit/opinion.ts";
import type { OpinionSession } from "../../../src/kit/opinionTools.ts";
import { createEditReporter, type EditReporter } from "../../../src/kit/docEdits.ts";
import { updateDocComments, type CommentUpdate } from "../../../src/kit/docComments.ts";
import type { DocSession } from "../../../src/kit/docTools.ts";
import type { OptionSet } from "../../../src/kit/options.ts";
import { planLine, resolveAction, type Effect, type PlanAction } from "./actions.ts";
import { checkSlug, listPlans, loadPlan, planDir, plansRoot, readInbox, releaseLock, repoName, savePlan, sendReport, slugify, takeLock, writeArtifact } from "./files.ts";
import {
  askNode,
  frontier,
  ingestReports,
  newPlan,
  opinionsPtr,
  planDoc,
  postArtifact,
  setArchitecture,
  setSlices,
  updateMap,
  updateNode,
  writable,
  type Architecture,
  type ArtifactKind,
  type MapInput,
  type NodeUpdate,
  type Plan,
  type PlanRef,
  type PlanState,
  type ReportInput,
  type SliceInput,
} from "./state.ts";

const r = at<PlanState>();

export interface OpenInput {
  worktree: string;
  slug?: string;
  title?: string;
  destination?: string;
}

export interface Opened {
  url: string;
  created: boolean;
  readOnly: boolean;
  plan: Plan;
  ref: PlanRef;
}

export interface ReportParams {
  worktree: string;
  plan: string;
  sliceId: string;
  status: ReportInput["status"];
  note: string;
  deviations?: { text: string; nodes?: string[] }[];
}

export class PlanSession implements WorkflowSession<PlanAction>, OpinionSession, DocSession {
  readonly #ctx: SurfaceContext<PlanState>;
  /** Names this Pi session in the plan's lock. */
  readonly #id = `pi-${process.pid}-${randomBytes(3).toString("hex")}`;
  #saving: Promise<void> = Promise.resolve();
  readonly #edits: EditReporter<PlanAction>;
  #saveError: string | undefined;

  constructor(ctx: SurfaceContext<PlanState>) {
    this.#ctx = ctx;
    this.#edits = createEditReporter((content, action) => ctx.inform(content, action));
  }

  get state(): PlanState {
    return this.#ctx.store.state;
  }

  /** Commits, then saves the plan to disk in order; a failed save is reported on the next tool call. */
  #commit(ops: PatchOp[]): void {
    if (!ops.length) {
      return;
    }
    this.#ctx.commit(ops);
    const { plan, ref, readOnly } = this.state;
    if (plan && ref && !readOnly) {
      const snapshot = structuredClone(plan);
      this.#saving = this.#saving.then(async () => {
        try {
          await savePlan(ref.dir, snapshot);
          this.#saveError = undefined;
        } catch (error) {
          this.#saveError = `could not save ${ref.dir}: ${error instanceof Error ? error.message : String(error)}`;
        }
      });
    }
  }

  /** Waits for pending saves; tools call it so the agent hears about a failed write. */
  async flush(): Promise<void> {
    await this.#saving;
    if (this.#saveError) {
      throw new SurfaceError(this.#saveError);
    }
  }

  status(): string | undefined {
    const plan = this.state.plan;
    if (!plan) {
      return undefined;
    }
    const open = frontier(plan).length;
    const ready = plan.slices.filter((s) => s.status === "ready" || s.status === "in-progress").length;
    return `${plan.slug} · ${open} on the frontier${plan.slices.length ? ` · ${ready}/${plan.slices.length} slices open` : ""}${this.state.readOnly ? " · read-only" : ""}`;
  }

  async #where(worktree: string): Promise<{ root: string; repo: string }> {
    checkWorktree(worktree);
    return { root: plansRoot(this.#ctx.settings()), repo: await repoName(this.#ctx.runner, worktree) };
  }

  /** Opens a plan, creating it when a title is given and none exists; takes its lock when no other live session holds it. */
  async open(input: OpenInput): Promise<Opened> {
    const { root, repo } = await this.#where(input.worktree);
    const slug = input.slug ?? (input.title ? slugify(input.title) : "");
    if (!slug) {
      const plans = await listPlans(root, repo);
      throw new SurfaceError(`name a plan: pass slug to open one${plans.length ? ` (${plans.join(", ")})` : ""}, or a title to start a new one under ${join(root, repo)}`);
    }
    checkSlug(slug);
    const dir = planDir(root, repo, slug);
    let plan = await loadPlan(dir);
    const created = !plan;
    if (!plan) {
      if (!input.title) {
        throw new SurfaceError(`no plan "${slug}" under ${join(root, repo)}; pass a title to start it`);
      }
      plan = newPlan(slug, input.title, repo, this.#ctx.now());
      if (input.destination) {
        plan.destination = input.destination;
      }
    }
    const ref: PlanRef = { repo, slug, dir, worktree: input.worktree };
    await this.#switchTo(ref, plan, created);
    const url = await this.#ctx.url();
    return { url, created, readOnly: this.state.readOnly, plan: this.state.plan!, ref };
  }

  async #switchTo(ref: PlanRef, plan: Plan, created: boolean): Promise<void> {
    const previous = this.state.ref;
    if (previous && previous.dir !== ref.dir) {
      await releaseLock(previous.dir, this.#id);
    }
    const holder = await takeLock(ref.dir, this.#id);
    this.#ctx.remember([replace(r("ref"), ref)]);
    const ops: PatchOp[] = [replace(r("plan"), plan), replace(r("readOnly"), Boolean(holder))];
    if (holder) {
      ops.push(add(r("lockHolder"), holder.session));
    } else if (this.state.lockHolder !== undefined) {
      ops.push(remove(r("lockHolder")));
    }
    this.#ctx.commit(ops);
    if (!holder) {
      if (created) {
        this.#commit([replace(r("plan", "updatedAt"), this.#ctx.now())]);
      }
      await this.#ingest();
    }
  }

  /** Reloads the plan this session had open before Pi restarted. */
  async restore(): Promise<void> {
    const ref = this.state.ref;
    if (!ref) {
      return;
    }
    const plan = await loadPlan(ref.dir);
    if (!plan) {
      throw new SurfaceError(`plan ${ref.slug} is gone from ${ref.dir}`);
    }
    await this.#switchTo(ref, plan, false);
  }

  /** Takes in slice reports other sessions left in the inbox. */
  async #ingest(): Promise<number> {
    const ref = this.state.ref;
    if (!ref || this.state.readOnly || !this.state.plan) {
      return 0;
    }
    const inbox = await readInbox(ref.dir);
    if (!inbox.reports.length) {
      return 0;
    }
    this.#commit(ingestReports(this.state, inbox.reports, this.#ctx.now()));
    await inbox.done();
    return inbox.reports.length;
  }

  async #reload(force: boolean): Promise<void> {
    const ref = this.state.ref;
    if (!ref) {
      throw new SurfaceError("no plan is open");
    }
    if (force) {
      await takeLock(ref.dir, this.#id, true);
    }
    const plan = await loadPlan(ref.dir);
    if (!plan) {
      throw new SurfaceError(`plan ${ref.slug} is gone from ${ref.dir}`);
    }
    await this.#switchTo(ref, plan, false);
  }

  async #effect(effect: Effect): Promise<void> {
    await this.#reload(effect.kind === "takeOver");
  }

  async handleAction(action: PlanAction): Promise<void> {
    const { ops, message, effect, edited } = resolveAction(this.state, action, this.#ctx.now());
    this.#commit(ops);
    if (edited) {
      await this.#edited(edited, action);
    }
    if (effect) {
      await this.#effect(effect);
    }
    if (message) {
      this.#ctx.notifyAgent(message, action);
    }
  }

  /** Writes an edited artifact's file, and tells the agent once the user stops editing that document. */
  async #edited(edit: { kind: string; id: string; label: string; before: string; after: string }, action: PlanAction): Promise<void> {
    const ref = this.state.ref!;
    if (edit.kind === "artifact") {
      await writeArtifact(ref.dir, `${edit.id}.md`, edit.after);
    }
    this.#edits.edited(`${edit.kind}:${edit.id}`, edit, action, this.line());
  }

  answerDocComments(kind: string, id: string, updates: CommentUpdate[]): void {
    const ref = this.state.ref;
    if (!ref) {
      throw new SurfaceError("no plan is open");
    }
    this.#commit(updateDocComments(planDoc(this.state, kind, id, ref.dir), updates, this.#ctx.now()));
  }

  // ---- agent tools ----

  map(input: MapInput): string[] {
    const { ops, created } = updateMap(this.state, input, this.#ctx.now());
    this.#commit(ops);
    return created;
  }

  ask(nodeId: string, choice: OptionSet): void {
    this.#commit(askNode(this.state, nodeId, choice, this.#ctx.now()));
  }

  node(nodeId: string, update: NodeUpdate): void {
    this.#commit(updateNode(this.state, nodeId, update, this.#ctx.now()));
  }

  architecture(input: Omit<Architecture, "at">): void {
    this.#commit(setArchitecture(this.state, input, this.#ctx.now()));
  }

  slices(inputs: SliceInput[]): void {
    this.#commit(setSlices(this.state, inputs, this.#ctx.now()));
  }

  async artifact(kind: ArtifactKind, markdown: string, final: boolean): Promise<string> {
    const ref = this.state.ref;
    this.#commit(postArtifact(this.state, kind, markdown, final, this.#ctx.now()));
    return writeArtifact(ref!.dir, `${kind}.md`, markdown);
  }

  postOpinionFindings(opinionId: string, input: { findings: FindingInput[]; summary?: string; runId?: string } | { failed: string }): void {
    this.#commit(postFindings(opinionsPtr, writable(this.state).opinions, opinionId, input, this.#ctx.now()));
  }

  updateOpinion(opinionId: string, update: OpinionUpdate): void {
    this.#commit(applyOpinionUpdate(opinionsPtr, writable(this.state).opinions, opinionId, update, this.#ctx.now()));
  }

  /** Leaves a slice report in a plan's inbox; when this session writes that plan, takes it in at once. */
  async report(params: ReportParams): Promise<{ dir: string; ingested: boolean }> {
    const { root, repo } = await this.#where(params.worktree);
    checkSlug(params.plan);
    const dir = planDir(root, repo, params.plan);
    if (!(await loadPlan(dir))) {
      const plans = await listPlans(root, repo);
      throw new SurfaceError(`no plan "${params.plan}" under ${join(root, repo)}${plans.length ? `; plans there: ${plans.join(", ")}` : ""}`);
    }
    if (!params.note.trim()) {
      throw new SurfaceError("a report needs a note");
    }
    await sendReport(dir, {
      sliceId: params.sliceId,
      status: params.status,
      note: params.note.trim(),
      deviations: (params.deviations ?? []).map((d) => ({ text: d.text, nodes: d.nodes ?? [] })),
      from: params.worktree,
      at: this.#ctx.now(),
    });
    const mine = this.state.ref?.dir === dir && !this.state.readOnly;
    if (mine) {
      await this.#ingest();
    }
    return { dir, ingested: mine };
  }

  /** The line agent messages and tool results start with. */
  line(): string {
    const { plan, ref } = this.state;
    return plan && ref ? planLine(plan, ref) : "";
  }

  async close(): Promise<void> {
    this.#edits.flush();
    await this.#saving;
    const ref = this.state.ref;
    if (ref) {
      await releaseLock(ref.dir, this.#id);
    }
  }
}
