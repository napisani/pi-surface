// The Feedback tab: every item grouped by where it is in the flow, beside the
// selected item. j and k step through the list in the order it shows.
import { useEffect, useMemo, useRef, useState } from "react";
import { useGlobalKey } from "../../../../web/kit/hooks/useGlobalKey.ts";
import { useHashState } from "../../../../web/kit/hooks/useHashState.ts";
import { EmptyState } from "../../../../web/kit/primitives/EmptyState.tsx";
import type { FeedbackState } from "../state.ts";
import css from "./FeedbackTab.module.css";
import { useFeedback } from "./hooks.ts";
import { ItemDetail } from "./ItemDetail.tsx";
import { ItemList } from "./ItemList.tsx";
import { openItem } from "./nav.ts";
import { listGroups, stepFrom, type ListFilter } from "./stage.ts";

const selectItems = (s: FeedbackState) => s.items;

export function FeedbackTab() {
  const items = useFeedback(selectItems);
  const [filter, setFilter] = useState<ListFilter>({ showHidden: false, showDone: true, decision: "all" });
  const [itemParam] = useHashState("item", "");
  const detail = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => listGroups(items, filter), [items, filter]);
  const order = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const item = items.find((i) => i.id === itemParam) ?? order[0];

  useEffect(() => {
    if (itemParam) {
      detail.current?.scrollIntoView({ block: "nearest" });
    }
  }, [itemParam]);
  // The tab sits in an Activity, which drops this listener while another tab shows.
  useGlobalKey((event) => {
    if (event.key !== "j" && event.key !== "k") {
      return;
    }
    const next = stepFrom(order, item?.id, event.key === "j" ? 1 : -1);
    if (!next) {
      return;
    }
    openItem(next);
    document.querySelector(`[data-item="${next}"]`)?.scrollIntoView({ block: "nearest" });
  });

  return (
    <div className={css.layout}>
      <ItemList groups={groups} active={item?.id} filter={filter} onFilter={setFilter} />
      <div ref={detail} className={css.detail}>
        {item ? <ItemDetail key={item.id} item={item} /> : <EmptyState>Pick an item on the left.</EmptyState>}
      </div>
    </div>
  );
}
