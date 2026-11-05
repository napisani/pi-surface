import { DEFAULT_KEYBINDINGS, keySequence, type KeybindingConfig } from "../../src/kit/keybindings.ts";

export interface Command {
  id: string;
  label: string;
  keys: readonly string[];
  /** A reason keeps a disabled command visible and prevents lower-scope fallthrough. */
  disabled?: string;
  run(): void | Promise<void>;
}

export interface Choice {
  id: string;
  label: string;
  detail?: string;
  disabled?: string;
  run(): void;
}

interface Registered {
  scope: string;
  priority: number;
  commands: readonly Command[];
}

export interface Binding {
  command: Command;
  scope: string;
  priority: number;
  keys: string[];
}

interface Picker {
  title: string;
  choices: readonly Choice[];
  query: string;
  index: number;
}

export interface KeyboardState {
  prefix: readonly string[];
  hints: boolean;
  error: string;
  picker: Picker | null;
  revision: number;
  pane: string;
}

/** Subsequence matching shared by command, file, view, and workflow pickers. */
export function fuzzyMatch(label: string, query: string): boolean {
  let at = 0;
  const text = label.toLocaleLowerCase();
  for (const char of query.toLocaleLowerCase().replaceAll(/\s/g, "")) {
    at = text.indexOf(char, at);
    if (at < 0) {
      return false;
    }
    at++;
  }
  return true;
}

export function displayKeys(keys: readonly string[]): string {
  return keys.map((key) => key === " " ? "Space" : key).join(" ");
}

/** Adjacent navigation clamps at the ends and starts at the first item if none is selected. */
export function adjacentId(ids: readonly string[], current: string | undefined, delta: number): string | undefined {
  const index = ids.indexOf(current ?? "");
  return ids[Math.max(0, Math.min(ids.length - 1, index < 0 ? 0 : index + delta))];
}

const startsWith = (keys: readonly string[], prefix: readonly string[]) => prefix.every((key, index) => keys[index] === key);

/** One page's registry, sequence state and fuzzy picker; it owns no browser listeners. */
export class Keyboard {
  #registrations = new Map<symbol, Registered>();
  #listeners = new Set<() => void>();
  #state: KeyboardState = { prefix: [], hints: false, error: "", picker: null, revision: 0, pane: "" };
  #config: KeybindingConfig = DEFAULT_KEYBINDINGS;
  #configurationError = "";
  #timer: ReturnType<typeof setTimeout> | undefined;
  bindings: Binding[] = [];
  commands: Command[] = [];

  get = () => this.#state;
  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };
  #set(next: Partial<KeyboardState>) {
    this.#state = { ...this.#state, ...next };
    for (const listener of [...this.#listeners]) {
      listener();
    }
  }
  configure(config: KeybindingConfig, error = "") {
    this.#config = config;
    this.#configurationError = error;
    this.#resolve();
  }
  register(scope: string, priority: number, commands: readonly Command[]): () => void {
    const token = Symbol(scope);
    this.#registrations.set(token, { scope, priority, commands });
    this.#resolve();
    return () => {
      this.#registrations.delete(token);
      this.#resolve();
    };
  }
  #resolve() {
    const bindings: Binding[] = [];
    const commands = new Map<string, Command>();
    let error = this.#configurationError;
    try {
      const registrations = [...this.#registrations.values()].toSorted((a, b) => b.priority - a.priority);
      for (const registration of registrations) {
        for (const command of registration.commands) {
          if (commands.has(command.id)) {
            throw new Error(`Duplicate command ID: ${command.id}`);
          }
          commands.set(command.id, command);
          const sequences = this.#config.bindings?.[command.id] ?? command.keys;
          for (const sequence of sequences) {
            const keys = keySequence(sequence, this.#config.leader);
            const same = bindings.find((b) => b.keys.length === keys.length && startsWith(b.keys, keys));
            if (same) {
              if (same.command.id === command.id) {
                continue;
              }
              if (same.priority === registration.priority) {
                throw new Error(`Conflicting binding ${displayKeys(keys)}: ${same.command.id} / ${command.id}`);
              }
              continue;
            }
            if (bindings.some((b) => startsWith(b.keys, keys) || startsWith(keys, b.keys))) {
              throw new Error(`Command/prefix conflict at ${displayKeys(keys)} (${command.id})`);
            }
            bindings.push({ ...registration, command, keys });
          }
        }
      }
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    }
    this.commands = [...commands.values()];
    this.bindings = error ? [] : bindings;
    this.cancel();
    this.closePicker();
    this.#set({ error, revision: this.#state.revision + 1 });
  }
  cancel() {
    clearTimeout(this.#timer);
    if (this.#state.prefix.length || this.#state.hints) {
      this.#set({ prefix: [], hints: false });
    }
  }
  focusPane(pane: string) {
    if (this.#state.pane !== pane) {
      this.cancel();
      this.#set({ pane });
    }
  }
  closePicker() {
    if (this.#state.picker) {
      this.#set({ picker: null });
    }
  }
  pick(title: string, choices: readonly Choice[]) {
    this.cancel();
    this.#set({ picker: { title, choices, query: "", index: 0 } });
  }
  searchCommands() {
    this.pick("Commands & bindings", this.commands.map((command) => ({
      id: command.id,
      label: command.label,
      detail: `${command.id} · ${this.bindings.filter((b) => b.command.id === command.id).map((b) => displayKeys(b.keys)).join(" / ") || "unbound"}`,
      disabled: command.disabled,
      run: () => this.invoke(command.id),
    })));
  }
  filter(query: string) {
    if (this.#state.picker) {
      this.#set({ picker: { ...this.#state.picker, query, index: 0 } });
    }
  }
  choices(): readonly Choice[] {
    const picker = this.#state.picker;
    return picker ? picker.choices.filter((choice) => fuzzyMatch(`${choice.label} ${choice.detail ?? ""}`, picker.query)) : [];
  }
  moveChoice(delta: number) {
    const picker = this.#state.picker;
    if (picker) {
      this.#set({ picker: { ...picker, index: Math.max(0, Math.min(this.choices().length - 1, picker.index + delta)) } });
    }
  }
  choose(index = this.#state.picker?.index ?? 0) {
    const choice = this.choices()[index];
    if (!choice || choice.disabled) {
      return;
    }
    this.closePicker();
    choice.run();
  }
  invoke(id: string) {
    const command = this.commands.find((candidate) => candidate.id === id);
    if (!command || command.disabled || this.#state.error) {
      return;
    }
    this.cancel();
    try {
      Promise.resolve(command.run()).catch((cause) => this.#set({ error: String(cause) }));
    } catch (cause) {
      this.#set({ error: String(cause) });
    }
  }
  /** Returns whether the caller should consume this key. */
  press(key: string): boolean {
    if (this.#state.error) {
      return false;
    }
    const prefix = [...this.#state.prefix, key];
    const matches = this.bindings.filter((binding) => startsWith(binding.keys, prefix));
    if (!matches.length) {
      const consumed = this.#state.prefix.length > 0;
      this.cancel();
      return consumed;
    }
    const complete = matches.find((binding) => binding.keys.length === prefix.length);
    if (complete) {
      this.cancel();
      this.invoke(complete.command.id);
    } else {
      clearTimeout(this.#timer);
      this.#set({ prefix, hints: false });
      this.#timer = setTimeout(() => this.#set({ hints: true }), 250);
    }
    return true;
  }
  continuations(): { key: string; label: string; disabled?: string }[] {
    const prefix = this.#state.prefix;
    const entries = new Map<string, { key: string; label: string; disabled?: string }>();
    const groups = new Map([["f", "Find"], ["c", "Changes"], ["v", "Inline AI"], ["a", "Stage for agent"], ["b", "Buffers / paths"], ["g", "Git"]]);
    for (const binding of this.bindings.filter((b) => startsWith(b.keys, prefix))) {
      const key = binding.keys[prefix.length];
      if (!key) {
        continue;
      }
      const leaf = binding.keys.length === prefix.length + 1;
      entries.set(key, { key, label: leaf ? binding.command.label : `${groups.get(key) ?? key}…`, disabled: leaf ? binding.command.disabled : undefined });
    }
    return [...entries.values()];
  }
}
