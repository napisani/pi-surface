import { useContext, useMemo, type ReactNode } from "react";
import { ScopeContext } from "./keyboardContext.ts";

export function KeyboardScope({ name, active, children }: { name: string; active: boolean; children: ReactNode }) {
  const parent = useContext(ScopeContext);
  const value = useMemo(() => ({ name: `${parent.name}/${name}`, priority: parent.priority + 1, active: parent.active && active }), [parent, name, active]);
  return <ScopeContext value={value}>{children}</ScopeContext>;
}
