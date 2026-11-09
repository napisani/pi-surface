import type { FindingInput } from "../state.ts";

/** A zero-concession finding: a config loader with one implementation behind an interface. */
export function inlineLoader(): FindingInput {
  return {
    id: "F1",
    title: "Inline the config loader interface",
    concession: "none",
    givesUp: "Nothing; the interface has one implementation and no test double.",
    simplification: "Callers use FileLoader directly and the ConfigLoader interface goes away.",
    recommended: "accept",
    lines: 24,
    concepts: ["ConfigLoader"],
    pros: ["One less type to read past", "Go to definition lands on the code"],
    cons: ["A second loader would bring the interface back"],
    visuals: [
      {
        kind: "diff",
        label: "Before / after",
        unified: "### src/config/load.ts\n@@ -1,6 +1,2 @@\n-export interface ConfigLoader { load(path: string): Config }\n-export class FileLoader implements ConfigLoader {\n+export class FileLoader {\n   load(path: string): Config {",
        stat: "1 file, −24 lines",
      },
    ],
    scores: {
      code: { value: 2, why: "24 lines" },
      concepts: { value: 3, why: "one interface" },
      behavior: { value: 5, why: "same calls" },
      reversible: { value: 5, why: "a revert" },
      safety: { value: 5, why: "typecheck proves it" },
    },
  };
}

/** An edge-case concession: two legacy date formats dropped. */
export function isoDatesOnly(): FindingInput {
  return {
    id: "F2",
    title: "Parse only ISO dates",
    concession: "edge",
    givesUp: "Config files with US or European dates fail to load with a clear error.",
    simplification: "One Date.parse call replaces the three-format parser and its locale table.",
    recommended: "accept",
    lines: 140,
    concepts: ["DateFormat", "localeTable"],
    pros: ["Removes the locale table", "One date format to document"],
    cons: ["Old configs with 03/04/2025 dates stop loading"],
    visuals: [
      { kind: "diff", label: "Before / after", unified: "### src/config/dates.ts\n-export function parseDate(s: string, formats = ALL_FORMATS) {\n+export const parseDate = (s: string) => new Date(s);" },
      {
        kind: "data",
        label: "Inputs",
        tables: [{ headers: ["Input", "Today", "Accepted"], rows: [["2025-03-04", "parses", "parses"], ["03/04/2025", "parses", "error"]], highlight: { "1": "bad" } }],
      },
    ],
    scores: {
      code: { value: 4, why: "140 lines" },
      concepts: { value: 4, why: "format enum and table" },
      behavior: { value: 3, why: "legacy dates fail" },
      reversible: { value: 4, why: "a revert; no data lost" },
      safety: { value: 4, why: "parser tests cover it" },
    },
  };
}
