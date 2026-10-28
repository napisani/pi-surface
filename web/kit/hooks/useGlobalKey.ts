import { useEffect, useEffectEvent } from "react";

const handlers = new Set<(event: KeyboardEvent) => void>();
const dispatch = (event: KeyboardEvent) => {
  const typing = event.target instanceof Element && event.target.closest("input, textarea") !== null;
  if (event.metaKey || event.ctrlKey || event.altKey || typing) {
    return;
  }
  for (const handler of [...handlers]) {
    handler(event);
  }
};

/** Runs on every keydown outside text inputs, through one listener shared by the page. */
export function useGlobalKey(handler: (event: KeyboardEvent) => void): void {
  const onKey = useEffectEvent(handler);
  useEffect(() => {
    const entry = (event: KeyboardEvent) => onKey(event);
    if (handlers.size === 0) {
      document.addEventListener("keydown", dispatch);
    }
    handlers.add(entry);
    return () => {
      handlers.delete(entry);
      if (handlers.size === 0) {
        document.removeEventListener("keydown", dispatch);
      }
    };
  }, []);
}
