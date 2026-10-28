import { cx } from "../../../../web/kit/cx.ts";
import { Badge } from "../../../../web/kit/primitives/Badge.tsx";
import css from "./DraftSide.module.css";
import { IdChips } from "./IdChips.tsx";
import { scrollToMark } from "./nav.ts";
import type { OutlineEntry, TbdMark } from "../draft.ts";

/** The draft's sections with their TBD counts, then every TBD and what it waits on. */
export function DraftSide({ outline, tbds }: { outline: readonly OutlineEntry[]; tbds: readonly TbdMark[] }) {
  return (
    <aside className={css.side}>
      {outline.length ? (
        <>
          <h4>Sections</h4>
          {outline.map((sec) => (
            <button key={sec.id} type="button" className={cx(css.section, sec.level === 3 && css.level3)} onClick={() => scrollToMark(sec.id)}>
              <span>{sec.title}</span>
              {sec.tbds ? <span className={css.count}>{sec.tbds} TBD</span> : <span className={css.done}>✓</span>}
            </button>
          ))}
        </>
      ) : null}
      <h4>TBD ({tbds.length})</h4>
      {tbds.length ? (
        tbds.map((t) => (
          <button key={t.id} type="button" className={css.tbd} onClick={() => scrollToMark(t.id)}>
            {t.ids.length ? <IdChips ids={t.ids} /> : <Badge tone="err">not asked yet</Badge>}
            <span className={css.what}>{t.text || t.section}</span>
          </button>
        ))
      ) : (
        <div className={css.empty}>Nothing left undecided.</div>
      )}
    </aside>
  );
}
