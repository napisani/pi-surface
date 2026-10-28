// A piece of work the user asked the agent for from the page (a review, a
// walkthrough, triage, a commit proposal), and the page's view of its progress.
import type { PatchOp } from "../host/patch.ts";
import { add, child, replace, type Ptr } from "../host/ptr.ts";
import { SurfaceError } from "../host/workflow.ts";

export type TaskStatus = "idle" | "running" | "done" | "failed";

export interface Task {
  status: TaskStatus;
  focus?: string;
  note?: string;
  requestedAt?: string;
  finishedAt?: string;
}

/** A task marked done, keeping the focus and request time it ran with. The caller adds its results. */
export function finishedTask(current: Task, now: string): Task {
  const task: Task = { status: "done", finishedAt: now };
  if (current.focus) {
    task.focus = current.focus;
  }
  if (current.requestedAt) {
    task.requestedAt = current.requestedAt;
  }
  return task;
}

/** Ops that mark a task as requested, keeping its previous results on show. */
export function startTask<S, T extends Task>(p: Ptr<S, T>, current: T, focus: string | undefined, now: string, busy: string): PatchOp[] {
  if (current.status === "running") {
    throw new SurfaceError(busy);
  }
  const next: T = { ...current, status: "running", requestedAt: now };
  delete next.note;
  delete next.focus;
  delete next.finishedAt;
  if (focus) {
    next.focus = focus;
  }
  return [replace(p, next)];
}

/**
 * Ops for the agent's progress note, or a failure, on a running task. A task
 * the page did not start is refused: nothing but results or a failure ends a
 * running task, so a stray note would lock the page's Run button.
 */
export function setTaskStatus<S, T extends Task>(p: Ptr<S, T>, current: T, status: "running" | "failed", note: string, now: string, label: string): PatchOp[] {
  if (current.status !== "running") {
    throw new SurfaceError(`${label} is not running; report progress only on work the page asked for`);
  }
  const task: Ptr<S, Task> = p;
  const ops = [replace(child(task, "status"), status), add(child(task, "note"), note)];
  if (status === "failed") {
    ops.push(add(child(task, "finishedAt"), now));
  }
  return ops;
}

/** Ops that end a running task from the page, when the agent will not; earlier results stay. */
export function stopTask<S, T extends Task>(p: Ptr<S, T>, current: T, now: string, label: string): PatchOp[] {
  return setTaskStatus(p, current, "failed", "Stopped from the page.", now, label);
}

/** Ops that mark a task done, keeping its other fields. */
export function finishTask<S, T extends Task>(p: Ptr<S, T>, current: T, now: string): PatchOp[] {
  return [replace(p, { ...current, status: "done", finishedAt: now })];
}
