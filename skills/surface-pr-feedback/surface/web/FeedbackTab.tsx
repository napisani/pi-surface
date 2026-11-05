// The Feedback tab: every item grouped by where it is in the flow, beside the
// selected item.
import { useEffect, useMemo, useRef, useState } from "react";
import { adjacentId } from "../../../../web/kit/keyboard.ts";
import { useCommands, useKeyboard } from "../../../../web/kit/keyboardContext.ts";
import { openItem } from "./nav.ts";
import { useHashState } from "../../../../web/kit/hooks/useHashState.ts";
import { EmptyState } from "../../../../web/kit/primitives/EmptyState.tsx";
import type { FeedbackState } from "../state.ts";
import css from "./FeedbackTab.module.css";
import { useFeedback } from "./hooks.ts";
import { ItemDetail } from "./ItemDetail.tsx";
import { ItemList } from "./ItemList.tsx";
import { listGroups, type ListFilter } from "./stage.ts";

const selectItems = (s: FeedbackState) => s.items;

export function FeedbackTab() {
  const items = useFeedback(selectItems);
  const [filter, setFilter] = useState<ListFilter>({ showHidden: false, showDone: true, decision: "all" });
  const [itemParam] = useHashState("item", "");
  const detail = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => listGroups(items, filter), [items, filter]);
  const order = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const item = items.find((i) => i.id === itemParam) ?? order[0];

  const keyboard = useKeyboard();
  const move = (delta: number) => {
    const id = adjacentId(order.map((entry) => entry.id), item?.id, delta);
    if (id) { openItem(id); }
  };
  useCommands([
    { id: "feedback.item.next", label: "Next feedback item", keys: ["j", "]d"], run: () => move(1) },
    { id: "feedback.item.previous", label: "Previous feedback item", keys: ["k", "[d"], run: () => move(-1) },
    { id: "feedback.item.find", label: "Find feedback", keys: ["<leader>fq"], run: () => keyboard?.pick("Feedback items", order.map((entry) => ({ id: entry.id, label: entry.id, detail: entry.messages.map((message) => message.body).join(" "), run: () => openItem(entry.id) }))) },
  ]);
  useEffect(() => {
    if (itemParam) {
      detail.current?.scrollIntoView({ block: "nearest" });
    }
  }, [itemParam]);

  return (
    <div className={css.layout}>
      <ItemList groups={groups} active={item?.id} filter={filter} onFilter={setFilter} />
      <div ref={detail} className={css.detail}>
        {item ? <ItemDetail key={item.id} item={item} /> : <EmptyState>Pick an item on the left.</EmptyState>}
      </div>
    </div>
  );
}
