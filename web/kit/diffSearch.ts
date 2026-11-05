// Searching a file's changed lines, not its unchanged context. Pure, so the
// Node tests cover it.
import type { FileDiffMetadata } from "@pierre/diffs";

const WORD = /^\w+$/;

/** Whether text holds token: as a whole word when the token is one, else anywhere. */
export function hasToken(text: string, token: string): boolean {
  if (!WORD.test(token)) {
    return text.includes(token);
  }
  for (let at = text.indexOf(token); at >= 0; at = text.indexOf(token, at + 1)) {
    const before = text[at - 1] ?? "";
    const after = text[at + token.length] ?? "";
    if (!/\w/.test(before) && !/\w/.test(after)) {
      return true;
    }
  }
  return false;
}

/** Whether any added or removed line of the file holds token. */
export function changesInclude(file: FileDiffMetadata, token: string): boolean {
  for (const hunk of file.hunks) {
    for (const block of hunk.hunkContent) {
      if (block.type !== "change") {
        continue;
      }
      const removed = file.deletionLines.slice(block.deletionLineIndex, block.deletionLineIndex + block.deletions);
      const added = file.additionLines.slice(block.additionLineIndex, block.additionLineIndex + block.additions);
      if ([...removed, ...added].some((line) => hasToken(line, token))) {
        return true;
      }
    }
  }
  return false;
}
