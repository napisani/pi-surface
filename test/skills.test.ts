import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { DefaultResourceLoader, SettingsManager, loadSkillsFromDir } from "@earendil-works/pi-coding-agent";

test("the package manifest loads the extension and all bundled skills without external configuration", async (t) => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const isolated = mkdtempSync(join(tmpdir(), "surface-package-"));
  t.after(() => rmSync(isolated, { recursive: true, force: true }));
  const loader = new DefaultResourceLoader({
    cwd: isolated,
    agentDir: isolated,
    settingsManager: SettingsManager.inMemory({ packages: [root] }),
    noContextFiles: true,
  });
  await loader.reload();
  assert.deepEqual(loader.getExtensions().errors, []);
  const extension = loader.getExtensions().extensions.find((entry) => entry.path === join(root, "extension/index.ts"));
  assert.ok(extension);
  assert.ok(extension.tools.has("surface_forge_ask"));
  assert.ok(extension.tools.has("surface_review_open"));
  assert.ok(extension.tools.has("surface_feedback_open"));
  assert.deepEqual(loader.getSkills().diagnostics, []);
  assert.deepEqual(
    loader.getSkills().skills
      .filter((skill) => skill.filePath.startsWith(join(root, "skills/")))
      .map((skill) => skill.name)
      .sort(),
    ["surface-code-review", "surface-forge-solution", "surface-pr-feedback"],
  );
});

test("Pi's own loader accepts every skill pi-surface ships, and only the user can invoke them", () => {
  // Pi skips a skill whose frontmatter does not parse, without failing startup.
  const { skills, diagnostics } = loadSkillsFromDir({ dir: fileURLToPath(new URL("../skills", import.meta.url)), source: "test" });
  assert.deepEqual(diagnostics, []);
  assert.deepEqual(
    skills.map((s) => [s.name, s.disableModelInvocation]).sort(),
    [
      ["surface-code-review", true],
      ["surface-forge-solution", true],
      ["surface-pr-feedback", true],
    ],
  );
});
