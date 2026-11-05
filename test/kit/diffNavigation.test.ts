import { parsePatchFiles } from "@pierre/diffs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { hunkStops, nextHunk } from "../../web/kit/diffNavigation.ts";

const patch = `diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -1,3 +1,3 @@
 context
-old
+new
 context
@@ -20,1 +20,1 @@
-old
+new
 diff --git a/b.ts b/b.ts
--- a/b.ts
+++ b/b.ts
@@ -1,1 +1,0 @@
-gone
`.replace("\n diff", "\ndiff");

test("hunks skip context, cross files, land on deletion sides, and stop at endpoints", () => {
  const files = parsePatchFiles(patch).flatMap((entry) => entry.files);
  const paths = files.map((file) => file.name);
  const stops = hunkStops(paths, new Map(files.map((file) => [file.name, file])));
  assert.equal(stops.length, 3);
  assert.equal(stops[0].line, 2);
  assert.equal(stops[2].side, "LEFT");
  assert.equal(stops[2].line, 1);
  assert.deepEqual(nextHunk(stops, paths, stops[1], 1), stops[2]);
  assert.deepEqual(nextHunk(stops, paths, stops[2], -1), stops[1]);
  assert.equal(nextHunk(stops, paths, stops[2], 1), undefined);
  assert.equal(nextHunk(stops, paths, stops[0], -1), undefined);
  assert.equal(hunkStops(["binary.png"], new Map()).length, 0);
});
