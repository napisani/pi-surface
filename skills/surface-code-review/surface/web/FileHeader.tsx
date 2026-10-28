import { useMemo } from "react";
import { CategoryTag } from "../../../../web/kit/CategoryTag.tsx";
import { Badge } from "../../../../web/kit/primitives/Badge.tsx";
import { Delta } from "../../../../web/kit/primitives/Delta.tsx";
import { Spacer } from "../../../../web/kit/primitives/Spacer.tsx";
import { Text } from "../../../../web/kit/primitives/Text.tsx";
import { StatusLetter } from "../../../../web/kit/StatusLetter.tsx";
import { useValue } from "../../../../web/kit/valueStore.ts";
import type { ReviewState } from "../state.ts";
import css from "./FileHeader.module.css";
import { useReview } from "./hooks.ts";
import { useNav } from "./nav.ts";
import { collapsedStore } from "./ui.ts";
import { useViewed } from "./useViewed.ts";

const selectFiles = (s: ReviewState) => s.files;
const selectFindings = (s: ReviewState) => s.review.findings;

/** A file's header in the diff: collapse, what changed, its findings, and the Viewed box. */
export function FileHeader({ path }: { path: string }) {
  const nav = useNav();
  const file = useReview(selectFiles).find((f) => f.path === path);
  const allFindings = useReview(selectFindings);
  const findings = useMemo(() => allFindings.filter((f) => !f.dismissed && f.primary.path === path), [allFindings, path]);
  const collapsed = useValue(collapsedStore);
  const [viewed, setViewed] = useViewed();
  if (!file) {
    return null;
  }
  const isViewed = viewed.has(path);
  const closed = collapsed.has(path) || isViewed;
  const toggle = () =>
    collapsedStore.update((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  return (
    <div className={css.head}>
      <button type="button" className={css.caret} onClick={toggle}>
        {closed ? "▸" : "▾"}
      </button>
      <StatusLetter status={file.status} />
      <span className={css.path}>
        {file.previousPath ? <Text tone="faint">{file.previousPath} → </Text> : null}
        {file.path}
      </span>
      <CategoryTag category={file.category} />
      {findings.map((f) => (
        <Badge key={f.id} mini severity={f.severity} onClick={() => nav.openFinding(f.id)}>
          {f.id}
        </Badge>
      ))}
      <Spacer />
      <Delta additions={file.additions} deletions={file.deletions} />
      <label className={css.viewed}>
        <input type="checkbox" checked={isViewed} onChange={(e) => setViewed(path, e.target.checked)} /> Viewed
      </label>
    </div>
  );
}
