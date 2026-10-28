// The feedback list: triage, bulk actions on ticked items, then every item grouped by stage.
import { useCallback, useState, type ReactNode } from "react";
import { Button } from "../../../../web/kit/primitives/Button.tsx";
import { Checkbox } from "../../../../web/kit/primitives/Checkbox.tsx";
import { EmptyState } from "../../../../web/kit/primitives/EmptyState.tsx";
import { Panel } from "../../../../web/kit/primitives/Panel.tsx";
import { Text } from "../../../../web/kit/primitives/Text.tsx";
import { usePending } from "../../../../web/kit/store.ts";
import { TaskBanner } from "../../../../web/kit/TaskBanner.tsx";
import type { FeedbackItem, FeedbackState } from "../state.ts";
import { usePost, useFeedback } from "./hooks.ts";
import css from "./ItemList.module.css";
import { ItemRow } from "./ItemRow.tsx";
import { openItem } from "./nav.ts";
import type { ListFilter, Stage } from "./stage.ts";

const selectItems = (s: FeedbackState) => s.items;
const selectTriage = (s: FeedbackState) => s.triage;
const selectGithub = (s: FeedbackState) => s.pr !== null;

export interface ItemListProps {
  groups: readonly { stage: Stage; label: string; items: FeedbackItem[] }[];
  active: string | undefined;
  filter: ListFilter;
  onFilter(filter: ListFilter): void;
}

function Bulk({ selected, onClear }: { selected: readonly string[]; onClear(): void }): ReactNode {
  const post = usePost();
  const drafting = usePending("autodraft");
  return (
    <Panel className={css.bulk}>
      <b>{selected.length} selected</b>
      <Button size="small" disabled={drafting} onClick={async () => (await post({ type: "replies.autoDraft", itemIds: [...selected] }, "autodraft")) && onClear()}>
        ✦ Draft replies
      </Button>
      <Button size="small" onClick={async () => (await post({ type: "triage.run", itemIds: [...selected] }, "triage")) && onClear()}>
        Re-triage
      </Button>
      <Button kind="ghost" size="small" onClick={onClear}>
        Clear
      </Button>
    </Panel>
  );
}

export function ItemList({ groups, active, filter, onFilter }: ItemListProps) {
  const post = usePost();
  const items = useFeedback(selectItems);
  const triage = useFeedback(selectTriage);
  const github = useFeedback(selectGithub);
  const triaging = usePending("triage");
  const [ticked, setTicked] = useState<ReadonlySet<string>>(() => new Set());
  const untriaged = items.filter((i) => !i.hidden && !i.analysis);
  const selected = items.filter((i) => ticked.has(i.id)).map((i) => i.id);
  const hidden = items.filter((i) => i.hidden).length;
  const onToggle = useCallback(
    (id: string) =>
      setTicked((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      }),
    [],
  );
  return (
    <div className={css.list}>
      <TaskBanner task={triage} running="The agent is triaging…" failed="Triage failed" onStop={() => void post({ type: "task.stop", task: "triage" })} />
      {untriaged.length && triage.status !== "running" ? (
        <Button wide disabled={triaging} onClick={() => void post({ type: "triage.run" }, "triage")}>
          ✦ Triage {untriaged.length} item{untriaged.length === 1 ? "" : "s"}
        </Button>
      ) : null}
      {selected.length ? <Bulk selected={selected} onClear={() => setTicked(new Set())} /> : null}
      <div className={css.toggles}>
        <Checkbox checked={filter.showDone} onChange={(showDone) => onFilter({ ...filter, showDone })}>
          Show done
        </Checkbox>
        {hidden ? (
          <Checkbox checked={filter.showHidden} onChange={(showHidden) => onFilter({ ...filter, showHidden })}>
            Show {hidden} hidden
          </Checkbox>
        ) : null}
        <Text tone="faint" small>
          j / k to move
        </Text>
      </div>
      {items.length === 0 ? <EmptyState small>No feedback yet. {github ? "Refresh after reviewers comment." : "Paste feedback in chat and ask the agent to add it."}</EmptyState> : null}
      {groups.map((g) => (
        <section key={g.stage}>
          <h3>
            {g.label} ({g.items.length})
          </h3>
          {g.items.map((i) => (
            <ItemRow key={i.id} item={i} on={active === i.id} selected={ticked.has(i.id)} onToggle={onToggle} onOpen={openItem} />
          ))}
        </section>
      ))}
    </div>
  );
}
