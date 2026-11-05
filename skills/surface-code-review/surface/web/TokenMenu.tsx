// The menu a click on a token in the diff opens: filter the files to changes
// that hold the token, or copy it.
import { useEffect, useRef } from "react";
import { toast } from "../../../../web/kit/toast.ts";
import { useValue } from "../../../../web/kit/valueStore.ts";
import css from "./TokenMenu.module.css";
import { filterStore, tokenMenuStore } from "./ui.ts";

const WIDTH = 280;
const close = () => tokenMenuStore.set(null);

export function TokenMenu() {
  const menu = useValue(tokenMenuStore);
  const filtered = useValue(filterStore).token;
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus();
  }, [menu]);
  if (!menu) {
    return null;
  }
  const { token } = menu;
  const filter = (next: string) => {
    filterStore.update((f) => ({ ...f, token: next }));
    close();
  };
  const copy = async () => {
    close();
    try {
      await navigator.clipboard.writeText(token);
      toast(`Copied ${token}`);
    } catch {
      toast("The browser refused clipboard access", true);
    }
  };
  return (
    <div className={css.backdrop} onMouseDown={(e) => (e.target === e.currentTarget ? close() : undefined)}>
      <div
        className={css.menu}
        role="menu"
        aria-label={`Token ${token}`}
        style={{ left: Math.max(8, Math.min(menu.x, window.innerWidth - WIDTH - 8)), top: Math.min(menu.y + 6, window.innerHeight - 140) }}
        onKeyDown={(e) => (e.key === "Escape" ? close() : undefined)}
      >
        <code className={css.token}>{token}</code>
        <button ref={first} type="button" role="menuitem" onClick={() => filter(token)} disabled={filtered === token}>
          Show only changes with this
        </button>
        {filtered ? (
          <button type="button" role="menuitem" onClick={() => filter("")}>
            Clear the token filter
          </button>
        ) : null}
        <button type="button" role="menuitem" onClick={() => void copy()}>
          Copy
        </button>
      </div>
    </div>
  );
}
