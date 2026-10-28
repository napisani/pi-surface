import type { QuestionInput } from "../state.ts";

/** The "Cache isolation" decision from the secret_inject session, trimmed. */
export function cacheIsolation(): QuestionInput {
  return {
    id: "D7",
    header: "Cache isolation",
    title: "Should this slice prevent one config from reusing another config's cached values?",
    prerequisites: ["D3"],
    lenses: [
      { id: "er", label: "ER diagram", kind: "mermaid" },
      { id: "diff", label: "Diff vs main", kind: "diff" },
    ],
    dimensions: [
      { id: "correct", label: "Cross-config correctness" },
      { id: "change", label: "Change size" },
      { id: "migrate", label: "Migration ease" },
    ],
    options: [
      {
        id: "isolate",
        label: "Isolate cache by source config",
        recommended: true,
        description: "Namespace cached values by source definitions and order.",
        pros: ["No config reads another config's values"],
        cons: ["Touches both storage backends", "Legacy cache file needs a migration"],
        visuals: {
          er: { kind: "mermaid", source: "erDiagram\n  CONFIG_FILE }o--|| CACHE_SCOPE : hashes" },
          diff: { kind: "diff", unified: "### internal/storage/file.go\n-type File struct{}\n+type File struct{ path string }", stat: "3 files" },
        },
        scores: { correct: { value: 5, why: "scoped" }, change: { value: 3, why: "two backends" }, migrate: { value: 2, why: "legacy file" } },
        impact: [{ kind: "change", text: "§Cache: one file per scope" }],
        specDelta: { size: 1, security: 1 },
      },
      {
        id: "defer",
        label: "Defer cache isolation",
        description: "Profiles filter whatever the shared cache returns.",
        pros: ["No storage change"],
        cons: ["Configs sharing a cache can read each other's values"],
        visuals: {
          er: { kind: "mermaid", source: "erDiagram\n  CONFIG_FILE }o--|| CACHE_FILE : shares" },
          diff: { kind: "na", reason: "storage is unchanged" },
        },
        scores: { correct: { value: 1, why: "shared" }, change: { value: 5, why: "none" }, migrate: { value: 5, why: "none" } },
      },
    ],
  };
}
