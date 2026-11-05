import { parsePatchFiles } from "@pierre/diffs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { changesInclude, hasToken } from "../../web/kit/diffSearch.ts";

test("a word token matches whole words only; other tokens match anywhere", () => {
  assert.equal(hasToken("const ok = check(token);", "check"), true);
  assert.equal(hasToken("const checked = 1;", "check"), false);
  assert.equal(hasToken("rechecks(); check_all();", "check"), false);
  assert.equal(hasToken("a === b", "==="), true);
  assert.equal(hasToken("a == b", "==="), false);
});

test("only added and removed lines count, not the unchanged context around them", () => {
  const patch = [
    "diff --git a/a.ts b/a.ts",
    "--- a/a.ts",
    "+++ b/a.ts",
    "@@ -1,4 +1,4 @@",
    " export function check(token: string) {",
    "-  return strict(token);",
    "+  return loose(token);",
    " }",
    " ",
  ].join("\n");
  const [file] = parsePatchFiles(patch, "t")[0].files;
  assert.equal(changesInclude(file, "strict"), true, "a removed line");
  assert.equal(changesInclude(file, "loose"), true, "an added line");
  assert.equal(changesInclude(file, "token"), true);
  assert.equal(changesInclude(file, "check"), false, "context only");
});
