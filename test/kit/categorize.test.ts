import assert from "node:assert/strict";
import { test } from "node:test";
import { categorize } from "../../src/kit/categorize.ts";

test("files sort into docs, tests, config and implementation by path", () => {
  const cases: [string, string][] = [
    ["README.md", "docs"],
    ["docs/adr/0001-native.md", "docs"],
    ["test/fixtures/README.md", "docs"],
    ["src/auth.test.ts", "test"],
    ["pkg/server/handler_test.go", "test"],
    ["tests/test_api.py", "test"],
    ["src/__snapshots__/view.snap", "test"],
    ["package-lock.json", "config"],
    [".github/workflows/ci.yml", "config"],
    ["tsconfig.build.json", "config"],
    ["src/auth.ts", "impl"],
    ["mods/agents/default.nix", "impl"],
    ["docs/build.ts", "impl"],
  ];
  for (const [path, category] of cases) {
    assert.equal(categorize(path), category, path);
  }
});
