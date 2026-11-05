import { Type, type Static } from "typebox";
import { Value } from "typebox/value";
import type { Json } from "../host/decode.ts";

const schema = Type.Object({
  leader: Type.Optional(Type.String({ minLength: 1 })),
  bindings: Type.Optional(Type.Record(Type.String(), Type.Array(Type.String({ minLength: 1 })))),
}, { additionalProperties: false });

export type KeybindingConfig = Static<typeof schema>;
export const keybindingsResponseSchema = Type.Union([Type.Object({ config: schema }), Type.Object({ error: Type.String() })]);
export const DEFAULT_KEYBINDINGS: KeybindingConfig = { leader: ";", bindings: {} };

/** Parses literal sequences and named keys, e.g. <leader>fk or <Ctrl+;>fk. */
export function keySequence(source: string, leader = ";"): string[] {
  const keys: string[] = [];
  let rest = source.replaceAll("<leader>", leader);
  while (rest) {
    if (rest.startsWith("<")) {
      const end = rest.indexOf(">");
      if (end < 0) {
        throw new Error(`Unclosed key in ${source}`);
      }
      const key = rest.slice(1, end);
      if (!/^(?:(?:Ctrl|Alt|Meta|Shift)\+)*(?:[^<>\s]|Space|Enter|Escape|Backspace|Tab|ArrowUp|ArrowDown|ArrowLeft|ArrowRight)$/.test(key)) {
        throw new Error(`Invalid key <${key}>`);
      }
      keys.push(key === "Space" ? " " : key);
      rest = rest.slice(end + 1);
    } else {
      const [key] = Array.from(rest);
      keys.push(key);
      rest = rest.slice(key.length);
    }
  }
  if (!keys.length) {
    throw new Error("A key sequence cannot be empty");
  }
  return keys;
}

/** Validates the user file and its sequence syntax before enabling shortcuts. */
export function parseKeybindings(value: Json): KeybindingConfig {
  if (!Value.Check(schema, value)) {
    throw new Error("Expected { leader?: string, bindings?: { commandId: string[] } }");
  }
  const leader = value.leader ?? ";";
  if (leader.includes("<leader>") || keySequence(leader).length !== 1) {
    throw new Error("The leader must be exactly one key or chord");
  }
  for (const sequences of Object.values(value.bindings ?? {})) {
    for (const sequence of sequences) {
      keySequence(sequence, leader);
    }
  }
  return value;
}
