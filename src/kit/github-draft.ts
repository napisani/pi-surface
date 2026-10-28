// Text the user posts to GitHub (review comments, replies). The agent may draft
// or revise it; only the user's click on the page posts it.
import type { PatchOp } from "../host/patch.ts";
import { add, child, remove, replace, type Ptr } from "../host/ptr.ts";
import { SurfaceError } from "../host/workflow.ts";

export type DraftStatus = "draft" | "posting" | "posted" | "failed";

export interface GitHubDraft {
  body: string;
  status: DraftStatus;
  /** True while the agent is drafting or revising the body. */
  assisting: boolean;
  /** The agent's one-line note about its last draft. */
  agentNote?: string;
  githubId?: number;
  url?: string;
  error?: string;
  updatedAt: string;
}

export type PostResult = { githubId: number; url: string } | { error: string };

export const MAX_DRAFT = 20_000;

export function newDraft(body: string, now: string, options: { assisting?: boolean; agentNote?: string } = {}): GitHubDraft {
  if (body.length > MAX_DRAFT) {
    throw new SurfaceError(`a draft is limited to ${MAX_DRAFT} characters`);
  }
  const draft: GitHubDraft = { body, status: "draft", assisting: options.assisting ?? false, updatedAt: now };
  if (options.agentNote) {
    draft.agentNote = options.agentNote;
  }
  return draft;
}

/** Throws unless the draft can still change on the page. */
export function checkEditable(draft: GitHubDraft, label: string): void {
  if (draft.status === "posted" || draft.status === "posting") {
    throw new SurfaceError(`${label} is already ${draft.status}; edit it on GitHub`);
  }
}

function checkBody(body: string, label: string): void {
  if (!body.trim()) {
    throw new SurfaceError(`${label} needs a body`);
  }
  if (body.length > MAX_DRAFT) {
    throw new SurfaceError(`${label} is limited to ${MAX_DRAFT} characters`);
  }
}

/** Ops that replace a draft's body; a failed draft becomes a draft again. */
export function editDraft<S, D extends GitHubDraft>(p: Ptr<S, D>, draft: D, body: string, now: string, label: string, agentNote?: string): PatchOp[] {
  checkEditable(draft, label);
  checkBody(body, label);
  const d: Ptr<S, GitHubDraft> = p;
  const ops = [replace(child(d, "body"), body), replace(child(d, "assisting"), false), replace(child(d, "updatedAt"), now)];
  if (agentNote !== undefined) {
    ops.push(add(child(d, "agentNote"), agentNote));
  }
  if (draft.status === "failed") {
    ops.push(replace(child(d, "status"), "draft"));
  }
  return ops;
}

export function setAssisting<S, D extends GitHubDraft>(p: Ptr<S, D>, draft: D, assisting: boolean, label: string): PatchOp[] {
  if (assisting) {
    checkEditable(draft, label);
  }
  const d: Ptr<S, GitHubDraft> = p;
  const ops = [replace(child(d, "assisting"), assisting)];
  if (assisting && draft.status === "failed") {
    ops.push(replace(child(d, "status"), "draft"));
  }
  return ops;
}

/** Ops that mark a draft as on its way to GitHub. */
export function startPosting<S, D extends GitHubDraft>(p: Ptr<S, D>, draft: D, label: string): PatchOp[] {
  checkEditable(draft, label);
  if (draft.assisting) {
    throw new SurfaceError(`${label} is still being drafted by the agent`);
  }
  checkBody(draft.body, label);
  const d: Ptr<S, GitHubDraft> = p;
  const ops = [replace(child(d, "status"), "posting")];
  if (draft.error !== undefined) {
    ops.push(remove(child(d, "error")));
  }
  return ops;
}

/** Ops that record a post's outcome. */
export function finishPosting<S, D extends GitHubDraft>(p: Ptr<S, D>, result: PostResult, now: string): PatchOp[] {
  const d: Ptr<S, GitHubDraft> = p;
  if ("error" in result) {
    return [replace(child(d, "status"), "failed"), add(child(d, "error"), result.error), replace(child(d, "updatedAt"), now)];
  }
  return [
    replace(child(d, "status"), "posted"),
    add(child(d, "githubId"), result.githubId),
    add(child(d, "url"), result.url),
    replace(child(d, "updatedAt"), now),
  ];
}
