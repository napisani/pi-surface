import assert from "node:assert/strict";
import { test } from "node:test";
import { applyPatch } from "../../src/host/patch.ts";
import { at, replace } from "../../src/host/ptr.ts";
import { changedSections, resolveDocAction, type DocAction, type DocScope } from "../../src/kit/docActions.ts";
import { updateDocComments, type DocComment, type DocTarget } from "../../src/kit/docComments.ts";
import { createEditReporter } from "../../src/kit/docEdits.ts";
import { anchorAt, findAnchor } from "../../src/kit/docText.ts";

test("a quote is found again after edits move it, using its context to pick between repeats", () => {
  const text = "Retry with backoff. Then retry once more at the edge.";
  const anchor = anchorAt(text, text.lastIndexOf("retry"), text.lastIndexOf("retry") + 5);
  const edited = `Intro added. ${text}`;
  const [start, end] = findAnchor(edited, anchor)!;
  assert.equal(edited.slice(start - 5, end + 5), "Then retry once");
  assert.equal(findAnchor("nothing here", anchor), undefined);
});

interface S {
  doc: { markdown: string; comments: DocComment[] };
}

function harness() {
  let state: S = { doc: { markdown: "# RFC\n\nWe meter at the edge.\n\n## Rollout\n\nBehind a flag.\n", comments: [] } };
  const p = at<S>();
  const target = (): DocTarget<S> => ({
    label: "the RFC",
    markdown: state.doc.markdown,
    comments: state.doc.comments,
    list: p("doc", "comments"),
    brief: { content: "/plans/rfc.md", revise: "republish it with surface_x_artifact" },
    save: (markdown) => [replace(p("doc", "markdown"), markdown)],
  });
  const scope = (): DocScope<S> => ({ doc: () => target(), allComments: () => state.doc.comments, tool: "surface_x_doc_comments" });
  const act = (a: DocAction) => {
    const r = resolveDocAction(scope(), a, "t");
    state = applyPatch(structuredClone(state), r.ops);
    return r;
  };
  return { act, target, get: () => state, apply: (ops: ReturnType<typeof updateDocComments>) => (state = applyPatch(structuredClone(state), ops)) };
}

test("comments queue, go to the agent as one batch, and must each be answered", () => {
  const h = harness();
  const doc = { docKind: "artifact", docId: "rfc" };
  h.act({ type: "doc.comment", ...doc, anchor: { quote: "at the edge", prefix: "We meter ", suffix: "." }, text: "Why the edge? The API knows the tenant." });
  h.act({ type: "doc.comment", ...doc, anchor: { quote: "Behind a flag", prefix: "", suffix: "." }, text: "Name the flag." });
  assert.deepEqual(h.get().doc.comments.map((c) => [c.id, c.status]), [["K1", "pending"], ["K2", "pending"]]);
  const { message } = h.act({ type: "doc.comments.send", ...doc });
  assert.match(message!, /^comments on the RFC\n- K1 on "at the edge"\n  user: Why the edge/);
  assert.match(message!, /call surface_x_doc_comments once \(docKind "artifact", docId "rfc"\)/);
  assert.throws(() => h.act({ type: "doc.comments.send", ...doc }), /still working on the last batch/);
  assert.throws(() => updateDocComments(h.target(), [{ commentId: "K1", status: "done", reply: "Moved to the API" }], "t"), /answer every comment sent: K2/);
  h.apply(updateDocComments(h.target(), [{ commentId: "K1", status: "done", reply: "Moved to the API" }, { commentId: "K2", status: "needs-input", reply: "Which flag system?" }], "t"));
  assert.deepEqual(h.get().doc.comments.map((c) => c.status), ["done", "needs-input"]);
  h.act({ type: "doc.comment.followUp", ...doc, commentId: "K2", text: "LaunchDarkly" });
  assert.equal(h.get().doc.comments[1].status, "pending");
});

test("a user's edit saves into the document and says which sections changed", () => {
  const h = harness();
  const after = h.get().doc.markdown.replace("Behind a flag.", "Behind the metering_v2 flag.");
  const r = h.act({ type: "doc.edit", docKind: "artifact", docId: "rfc", markdown: after });
  assert.equal(h.get().doc.markdown, after);
  assert.deepEqual(changedSections(r.edited!.before, r.edited!.after), ["Rollout"]);
});

test("edits to one document are reported once, after the user stops, naming the changed sections", async () => {
  const sent: string[] = [];
  const reporter = createEditReporter<string>((content) => sent.push(content), 20);
  reporter.edited("rfc", { label: "the RFC", before: "## A\none\n## B\ntwo\n", after: "## A\nONE\n## B\ntwo\n" }, "edit", "Plan: x");
  reporter.edited("rfc", { label: "the RFC", before: "## A\nONE\n## B\ntwo\n", after: "## A\nONE\n## B\nTWO\n" }, "edit", "Plan: x");
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(sent.length, 1);
  assert.match(sent[0], /^the user edited the RFC\nPlan: x\nSections changed: A, B\./);
});
