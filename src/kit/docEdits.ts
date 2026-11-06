// Tells the agent about the user's edits to a document once they stop typing,
// one message per editing burst naming the sections that changed.
import { changedSections } from "./docActions.ts";

const QUIET_MS = 15_000;

export interface DocEdit {
  label: string;
  before: string;
  after: string;
}

export interface EditReporter<A> {
  /** Records an edit to one document; the message goes out after QUIET_MS without another. */
  edited(key: string, edit: DocEdit, action: A, context: string): void;
  /** Sends every pending report now, e.g. when the session closes. */
  flush(): void;
}

export function createEditReporter<A>(inform: (content: string, action: A) => void, quietMs = QUIET_MS): EditReporter<A> {
  const pending = new Map<string, DocEdit & { action: A; context: string; timer: ReturnType<typeof setTimeout> }>();
  const report = (key: string) => {
    const edit = pending.get(key);
    pending.delete(key);
    if (!edit || edit.before === edit.after) {
      return;
    }
    const sections = changedSections(edit.before, edit.after);
    inform(
      [`the user edited ${edit.label}`, edit.context, `Sections changed: ${sections.join(", ") || "(none named)"}.`, "Their text is now the document; read it before you next change it, and build on their wording rather than reverting it."].filter(Boolean).join("\n"),
      edit.action,
    );
  };
  return {
    edited(key, edit, action, context) {
      const previous = pending.get(key);
      clearTimeout(previous?.timer);
      pending.set(key, { label: edit.label, before: previous?.before ?? edit.before, after: edit.after, action, context, timer: setTimeout(() => report(key), quietMs) });
    },
    flush() {
      for (const key of [...pending.keys()]) {
        clearTimeout(pending.get(key)?.timer);
        report(key);
      }
    },
  };
}
