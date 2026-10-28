import assert from "node:assert/strict";
import { test } from "node:test";
import { replyEndpoint } from "../github.ts";
import { postedBody, type FeedbackItem, type FeedbackPr } from "../state.ts";

test("thread replies go into the thread; other replies become a PR comment quoting the original", () => {
  // SAFETY: replyEndpoint reads only the owner, repo and number.
  const pr = { owner: "acme", repo: "widgets", number: 42 } as FeedbackPr;
  assert.equal(replyEndpoint(pr, { kind: "thread", rootId: 11 }), "repos/acme/widgets/pulls/42/comments/11/replies");
  assert.equal(replyEndpoint(pr, { kind: "review" }), "repos/acme/widgets/issues/42/comments");
  // SAFETY: postedBody reads only the source, author and first message body.
  const review = { source: { kind: "review", reviewId: 1, state: "COMMENTED" }, author: "bob", messages: [{ body: "one\n\ntwo\nthree\nfour" }] } as FeedbackItem;
  assert.equal(postedBody(review, "Done."), "@bob\n> one\n> two\n> three\n> …\n\nDone.");
  // SAFETY: as above, with a thread source.
  const thread = { ...review, source: { kind: "thread", rootId: 1, resolved: false, outdated: false } } as FeedbackItem;
  assert.equal(postedBody(thread, "Done."), "Done.");
});
