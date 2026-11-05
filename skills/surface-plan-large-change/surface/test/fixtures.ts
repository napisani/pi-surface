import type { OptionSet } from "../../../../src/kit/options.ts";

/** Two options for where metering runs, with the central one recommended. */
export function choice(): OptionSet {
  const visual = (label: string) => ({ kind: "mermaid" as const, source: `flowchart LR\n  A[request] --> B[${label}]` });
  return {
    lenses: [{ id: "flow", label: "Flow", kind: "mermaid" }],
    dimensions: [
      { id: "latency", label: "Latency" },
      { id: "ops", label: "Operations" },
    ],
    options: [
      {
        id: "edge",
        label: "At the edge",
        description: "Count requests in the edge workers before they reach the API.",
        pros: ["Sees every request"],
        cons: ["No tenant ids at the edge"],
        visuals: { flow: visual("edge meter") },
        scores: { latency: { value: 5, why: "no extra hop" }, ops: { value: 2, why: "new edge deploys" } },
      },
      {
        id: "central",
        label: "In the API",
        recommended: true,
        description: "Count in the API middleware where tenants are known.",
        pros: ["Knows the tenant"],
        cons: ["Misses rejected requests"],
        visuals: { flow: visual("api meter") },
        scores: { latency: { value: 4, why: "in-process" }, ops: { value: 5, why: "existing deploys" } },
      },
    ],
  };
}
