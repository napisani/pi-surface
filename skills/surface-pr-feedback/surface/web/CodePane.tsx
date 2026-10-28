import type { Rev, Side } from "../../../../src/kit/code.ts";
import { CodeRef } from "../../../../web/kit/CodeRef.tsx";
import { Button } from "../../../../web/kit/primitives/Button.tsx";
import { Note } from "../../../../web/kit/primitives/Note.tsx";
import { Section } from "../../../../web/kit/primitives/Section.tsx";
import type { FeedbackItem, FeedbackState } from "../state.ts";
import { useFeedback } from "./hooks.ts";
import { REV_LABEL } from "./labels.ts";
import { showChanges } from "./nav.ts";
import { ReviewerHunk } from "./ReviewerHunk.tsx";

const selectFiles = (s: FeedbackState) => s.files;

/** The revision an anchor's side reads: chat feedback is about the working tree, a review about the PR head. */
function revOf(side: Side, chat: boolean): Rev {
  if (side === "LEFT") {
    return "base";
  }
  return chat ? "work" : "head";
}

/** The code an item is about: as the reviewer saw it, and as it is now. */
export function CodePane({ item }: { item: FeedbackItem }) {
  const files = useFeedback(selectFiles);
  const a = item.anchor;
  if (!a) {
    return null;
  }
  const changed = files.some((f) => f.path === a.path);
  const side = revOf(a.side, item.source.kind === "chat");
  const now =
    item.source.kind === "chat" || a.line !== null ? (
      <CodeRef role={item.source.kind === "chat" ? "The code" : "At the PR head"} codeRef={{ path: a.path, rev: side, startLine: a.startLine ?? a.line!, endLine: a.line! }} label={REV_LABEL[side]} />
    ) : (
      <Note>This thread is outdated: the lines it was on changed after the comment{a.originalLine ? ` (it was on line ${a.originalLine})` : ""}.</Note>
    );
  return (
    <Section title="The code">
      {a.diffHunk ? <ReviewerHunk path={a.path} hunk={a.diffHunk} /> : null}
      {now}
      {changed ? (
        <Button size="small" onClick={() => showChanges(a.path)}>
          See your changes to {a.path.split("/").pop()} →
        </Button>
      ) : null}
    </Section>
  );
}
