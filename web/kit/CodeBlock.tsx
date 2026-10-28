import css from "./CodeBlock.module.css";

const markOf = (line: string) => {
  if (line.startsWith("+")) {
    return css.ad;
  }
  return line.startsWith("-") ? css.dl : undefined;
};

/** Code or a sketch; with `marked`, lines starting with + or - read as a proposed change. */
export function CodeBlock({ text, marked = true }: { text: string; marked?: boolean }) {
  return (
    <pre className={css.pre}>
      {text.split("\n").map((line, i) => {
        const cls = marked ? markOf(line) : undefined;
        return (
          <span key={i} className={cls}>
            {i ? "\n" : ""}
            {line}
          </span>
        );
      })}
    </pre>
  );
}
