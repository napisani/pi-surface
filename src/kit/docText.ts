// Where a quoted passage sits in a document's text, found again after edits
// moved it: the W3C text-quote approach of a quote plus a little context.
// Pure, so the Node tests cover it.

export interface DocAnchor {
  quote: string;
  /** Up to CONTEXT characters before the quote when it was made. */
  prefix: string;
  suffix: string;
}

export const CONTEXT = 32;

export function anchorAt(text: string, start: number, end: number): DocAnchor {
  return { quote: text.slice(start, end), prefix: text.slice(Math.max(0, start - CONTEXT), start), suffix: text.slice(end, end + CONTEXT) };
}

const sharedSuffix = (a: string, b: string) => {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) {
    n++;
  }
  return n;
};

const sharedPrefix = (a: string, b: string) => {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) {
    n++;
  }
  return n;
};

/** The [start, end) of the occurrence of the quote whose context matches best, or undefined when the quote is gone. */
export function findAnchor(text: string, anchor: DocAnchor): [number, number] | undefined {
  if (!anchor.quote) {
    return undefined;
  }
  let best: [number, number] | undefined;
  let bestScore = -1;
  for (let at = text.indexOf(anchor.quote); at >= 0; at = text.indexOf(anchor.quote, at + 1)) {
    const end = at + anchor.quote.length;
    const score = sharedSuffix(text.slice(Math.max(0, at - CONTEXT), at), anchor.prefix) + sharedPrefix(text.slice(end, end + CONTEXT), anchor.suffix);
    if (score > bestScore) {
      best = [at, end];
      bestScore = score;
    }
  }
  return best;
}
