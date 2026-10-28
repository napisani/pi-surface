import type { Task } from "../../src/kit/task.ts";
import { Banner } from "./primitives/Banner.tsx";
import { Button } from "./primitives/Button.tsx";
import { Spinner } from "./primitives/Spinner.tsx";
import css from "./TaskBanner.module.css";

export interface TaskBannerProps {
  task: Task;
  running: string;
  failed: string;
  /** Ends the task from the page, for when the agent stopped without reporting. */
  onStop(): void;
}

/** The running or failed banner for a task the page asked the agent for. */
export function TaskBanner({ task, running, failed, onStop }: TaskBannerProps) {
  if (task.status === "running") {
    return (
      <Banner tone="run">
        <Spinner />
        <span className={css.text}>
          {task.note ?? running}
          {task.focus ? <span className={css.focus}> · focus: {task.focus}</span> : null}
        </span>
        <Button kind="ghost" size="small" title="Stop waiting for the agent; earlier results stay" onClick={onStop}>
          Stop
        </Button>
      </Banner>
    );
  }
  if (task.status === "failed") {
    return (
      <Banner tone="err">
        {failed}: {task.note ?? "no reason given"}
      </Banner>
    );
  }
  return null;
}
