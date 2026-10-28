export type CommitStatus = "proposed" | "committing" | "committed" | "failed";

/** A commit the agent proposed; only the user's click on the page makes it. */
export interface CommitPlan {
  id: string;
  message: string;
  items: string[];
  paths: string[];
  status: CommitStatus;
  sha?: string;
  /** The PR head on GitHub contains the commit. */
  pushed: boolean;
  error?: string;
}
