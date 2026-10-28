import { useSyncExternalStore } from "react";
import { cx } from "./cx.ts";
import { toasts } from "./toast.ts";
import css from "./Toaster.module.css";

export function Toaster() {
  const items = useSyncExternalStore(toasts.subscribe, toasts.get, toasts.get);
  return (
    <div className={css.stack}>
      {items.map((t) => (
        <div key={t.id} className={cx(css.toast, t.error && css.err)}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
