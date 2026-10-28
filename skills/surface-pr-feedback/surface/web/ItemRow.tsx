import { memo } from "react";
import { cx } from "../../../../web/kit/cx.ts";
import { Badge, DRAFT_TONE, ROUND_TONE } from "../../../../web/kit/primitives/Badge.tsx";
import { Text } from "../../../../web/kit/primitives/Text.tsx";
import { ROUND_LABEL } from "../../../../web/kit/RoundThread.tsx";
import type { FeedbackItem } from "../state.ts";
import css from "./ItemRow.module.css";
import { DECISION_LABEL, DECISION_TONE, KIND, RECOMMENDATION_TONE, short } from "./labels.ts";

function place(item: FeedbackItem): string {
  const a = item.anchor;
  if (!a) {
    return KIND[item.source.kind].label;
  }
  const line = a.line ?? a.originalLine;
  return `${a.path.split("/").pop()}${line ? `:${line}` : ""}`;
}

export interface ItemRowProps {
  item: FeedbackItem;
  on: boolean;
  selected: boolean;
  onToggle(id: string): void;
  onOpen(id: string): void;
}

/** A feedback item in the list: who said what where, the agent's take, and where it is in the flow. */
export const ItemRow = memo(function ItemRow({ item, on, selected, onToggle, onOpen }: ItemRowProps) {
  const a = item.analysis;
  const flags = item.source.kind === "thread" ? [item.source.outdated ? "outdated" : "", item.source.resolved ? "resolved" : ""].filter(Boolean) : [];
  return (
    <div className={cx(css.row, on && css.on, item.hidden && css.hidden)} data-item={item.id} onClick={() => onOpen(item.id)}>
      <input type="checkbox" checked={selected} onClick={(e) => e.stopPropagation()} onChange={() => onToggle(item.id)} />
      <div className={css.main}>
        <div className={css.title}>
          <b>{item.id}</b> <span title={KIND[item.source.kind].label}>{KIND[item.source.kind].icon}</span> <span className={css.who}>@{item.author}</span>{" "}
          <Text tone="faint" mono small>
            {place(item)}
          </Text>
        </div>
        <div className={css.text}>{a?.meaning ?? item.messages[0]?.body.split("\n")[0] ?? ""}</div>
        <div className={css.meta}>
          {a && item.decision === "undecided" ? (
            <Badge tone={RECOMMENDATION_TONE[a.recommendation]} title="The agent's recommendation">
              ✦ {a.recommendation}
            </Badge>
          ) : null}
          {a ? (
            <Text tone="faint" mono>
              R/I/W {short(a.risk)}/{short(a.importance)}/{short(a.rework)}
            </Text>
          ) : (
            <Text tone="faint">not triaged</Text>
          )}
          {a?.promised ? <Badge tone="link">promised</Badge> : null}
          {item.decision !== "undecided" ? <Badge tone={DECISION_TONE[item.decision]}>{DECISION_LABEL[item.decision]}</Badge> : null}
          {item.fix ? <Badge tone={ROUND_TONE[item.fix.status]}>fix {ROUND_LABEL[item.fix.status]}</Badge> : null}
          {item.reply ? <Badge tone={DRAFT_TONE[item.reply.status]}>{item.reply.assisting ? "reply…" : `reply ${item.reply.status}`}</Badge> : null}
          {flags.map((f) => (
            <Badge key={f}>{f}</Badge>
          ))}
        </div>
      </div>
    </div>
  );
});
