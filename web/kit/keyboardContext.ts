import { createContext, useContext, useEffect, useEffectEvent, useId } from "react";
import type { Command, Keyboard } from "./keyboard.ts";

export const KeyboardContext = createContext<Keyboard | null>(null);
export const ScopeContext = createContext({ name: "app", priority: 0, active: true });

export function useKeyboard() {
  return useContext(KeyboardContext);
}

/** Commands follow explicit scope activation, including CSS-hidden tabs. */
export function useCommands(commands: readonly Command[], active = true, priority = 0): void {
  const keyboard = useKeyboard();
  const scope = useContext(ScopeContext);
  const id = useId();
  const signature = JSON.stringify(commands.map(({ run: _run, ...spec }) => spec));
  const read = useEffectEvent(() => commands);
  const run = useEffectEvent((commandId: string) => commands.find((command) => command.id === commandId)?.run());
  useEffect(() => {
    if (!keyboard || !scope.active || !active) {
      return;
    }
    return keyboard.register(`${scope.name}:${id}`, scope.priority + priority, read().map((command) => ({ ...command, run: () => run(command.id) })));
  }, [keyboard, scope.name, scope.priority, scope.active, active, id, signature, priority]);
}
