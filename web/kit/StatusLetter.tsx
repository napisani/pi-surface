import type { FileStatus } from "../../src/kit/git.ts";
import { cx } from "./cx.ts";
import css from "./StatusLetter.module.css";

const LETTER = { added: "A", modified: "M", deleted: "D", renamed: "R", copied: "C" } satisfies Record<FileStatus, string>;

/** A file's change as one colored letter: A, M, D, R or C. */
export function StatusLetter({ status }: { status: FileStatus }) {
  return <span className={cx(css.st, css[status])}>{LETTER[status]}</span>;
}
