import css from "./UnifiedDiff.module.css";

// The first prefix that matches styles the line; "###" is checked before "+" and "-" on purpose.
const LINE_KINDS = [
  ["###", css.fh],
  ["@@", css.hk],
  ["+", css.ad],
  ["-", css.dl],
] as const;

/** A unified diff sketch: '###' starts a file, '@@' a hunk. */
export function UnifiedDiff({ text }: { text: string }) {
  return (
    <pre className={css.diff}>
      {text.split("\n").map((line, i) => {
        const kind = LINE_KINDS.find(([prefix]) => line.startsWith(prefix))?.[1] ?? css.cx;
        return (
          <div key={i} className={kind}>
            {line.startsWith("###") ? line.slice(3).trim() : line || " "}
          </div>
        );
      })}
    </pre>
  );
}
