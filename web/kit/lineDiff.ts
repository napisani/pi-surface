// A line diff for showing what corrections changed, as UnifiedDiff text. Pure,
// so the Node tests cover it.

const MAX_CELLS = 4_000_000;
const CONTEXT = 2;

/** Unified-style lines ("-", "+", " "), long unchanged runs folded into "@@" markers. */
export function lineDiff(before: string, after: string): string {
  const a = before.split("\n");
  const b = after.split("\n");
  if (a.length * b.length > MAX_CELLS) {
    return [...a.map((l) => `-${l}`), ...b.map((l) => `+${l}`)].join("\n");
  }
  // Longest common subsequence lengths, filled from the end so the walk below goes forward.
  const lcs = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const lines: string[] = [];
  let [i, j] = [0, 0];
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      lines.push(` ${a[i]}`);
      i++;
      j++;
    } else if (j < b.length && (i >= a.length || lcs[i][j + 1] >= lcs[i + 1][j])) {
      lines.push(`+${b[j++]}`);
    } else {
      lines.push(`-${a[i++]}`);
    }
  }
  return fold(lines);
}

function fold(lines: string[]): string {
  const changed = lines.map((l) => l[0] !== " ");
  const keep = lines.map((_, n) => changed.slice(Math.max(0, n - CONTEXT), n + CONTEXT + 1).some(Boolean));
  const out: string[] = [];
  let skipped = 0;
  lines.forEach((line, n) => {
    if (keep[n]) {
      if (skipped) {
        out.push(`@@ ${skipped} unchanged line${skipped === 1 ? "" : "s"} @@`);
        skipped = 0;
      }
      out.push(line);
    } else {
      skipped++;
    }
  });
  if (skipped && out.length) {
    out.push(`@@ ${skipped} unchanged line${skipped === 1 ? "" : "s"} @@`);
  }
  return out.length ? out.join("\n") : "@@ no changes @@";
}
