import assert from "node:assert/strict";
import { test } from "node:test";
import { commentRequest } from "../github.ts";
import type { DraftComment, ReviewPr } from "../state.ts";

test("a draft becomes GitHub's create-comment request, ranges and replies included", () => {
  // SAFETY: commentRequest reads only these PR fields and the draft's anchor, body and inReplyTo.
  const pr = { owner: "acme", repo: "widgets", number: 42, headSha: "h".repeat(40) } as ReviewPr;
  // SAFETY: as above.
  const draft = { anchor: { path: "src/a.ts", side: "RIGHT", line: 9, startLine: 7 }, body: "Range" } as DraftComment;
  assert.deepEqual(commentRequest(pr, draft), {
    endpoint: "repos/acme/widgets/pulls/42/comments",
    body: { body: "Range", commit_id: pr.headSha, path: "src/a.ts", side: "RIGHT", line: 9, start_line: 7, start_side: "RIGHT" },
  });
  assert.deepEqual(commentRequest(pr, { ...draft, inReplyTo: 5 }), { endpoint: "repos/acme/widgets/pulls/42/comments/5/replies", body: { body: "Range" } });
});
