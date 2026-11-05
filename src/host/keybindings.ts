import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { DEFAULT_KEYBINDINGS, parseKeybindings, type KeybindingConfig } from "../kit/keybindings.ts";
import { messageOf } from "./workflow.ts";

export type KeybindingsResult = { config: KeybindingConfig; error?: never } | { error: string; config?: never };

/** Missing files use defaults; malformed files disable shortcuts with a visible error. */
export async function loadKeybindings(path = join(homedir(), ".pi", "agent", "surface-keybindings.json")): Promise<KeybindingsResult> {
  try {
    return { config: parseKeybindings(JSON.parse(await readFile(path, "utf8"))) };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { config: DEFAULT_KEYBINDINGS };
    }
    return { error: `Keyboard configuration: ${messageOf(error)}` };
  }
}
