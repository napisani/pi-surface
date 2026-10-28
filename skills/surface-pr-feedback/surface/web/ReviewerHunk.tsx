import { UnifiedDiff } from "../../../../web/kit/UnifiedDiff.tsx";
import css from "./ReviewerHunk.module.css";

/** The diff hunk GitHub stored with a review comment: the code as the reviewer saw it. */
export function ReviewerHunk({ path, hunk }: { path: string; hunk: string }) {
  return (
    <div className={css.frame}>
      <div className={css.head}>
        <span className={css.role}>As the reviewer saw it</span>
        <span className={css.path}>{path}</span>
      </div>
      <UnifiedDiff text={hunk} />
    </div>
  );
}
