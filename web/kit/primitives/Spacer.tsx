import css from "./Spacer.module.css";

/** Takes the free space in a row, pushing what follows to the end. */
export function Spacer() {
  return <span className={css.spacer} />;
}
