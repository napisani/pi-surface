import { useMemo } from "react";
import { Badge } from "../../../../web/kit/primitives/Badge.tsx";
import { Delta } from "../../../../web/kit/primitives/Delta.tsx";
import { Spacer } from "../../../../web/kit/primitives/Spacer.tsx";
import { Text } from "../../../../web/kit/primitives/Text.tsx";
import { StatusLetter } from "../../../../web/kit/StatusLetter.tsx";
import type { ValueStore } from "../../../../web/kit/valueStore.ts";
import { useValue } from "../../../../web/kit/valueStore.ts";
import type { FeedbackState } from "../state.ts";
import css from "./ChangeHeader.module.css";
import { useFeedback } from "./hooks.ts";
import { openItem } from "./nav.ts";

const selectFiles = (s: FeedbackState) => s.files;
const selectItems = (s: FeedbackState) => s.items;

/** A changed file's header: collapse, what changed, and the feedback items on it. */
export function ChangeHeader({ path, collapsed }: { path: string; collapsed: ValueStore<ReadonlySet<string>> }) {
  const file = useFeedback(selectFiles).find((f) => f.path === path);
  const items = useFeedback(selectItems);
  const related = useMemo(() => items.filter((i) => !i.hidden && (i.anchor?.path === path || i.fix?.files.includes(path))), [items, path]);
  const closed = useValue(collapsed).has(path);
  if (!file) {
    return null;
  }
  const toggle = () =>
    collapsed.update((prev) => {
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
      {related.map((i) => (
        <Badge key={i.id} mini title={`Open ${i.id}`} onClick={() => openItem(i.id)}>
          {i.id}
        </Badge>
      ))}
      <Spacer />
      <Delta additions={file.additions} deletions={file.deletions} />
    </div>
  );
}
