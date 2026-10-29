// Which findings have had a fix requested, and how far it got. Pure, so the
// Node tests cover it.
import type { Finding } from "../../../../src/kit/findings.ts";
import type { RoundStatus } from "../../../../src/kit/rounds.ts";
import type { ChangeRequest } from "../state.ts";

export const FIX_LABEL = { pending: "fix queued", sent: "fixing", done: "✓ fixed", declined: "fix declined", "needs-input": "fix needs input" } satisfies Record<RoundStatus, string>;

/** Statuses that mean a fix is applied or on its way, so selecting all skips the finding. */
export const IN_HAND: ReadonlySet<RoundStatus> = new Set(["pending", "sent", "done"]);

/**
 * The latest change request made from each finding. Matching the title too
 * keeps a rerun, which renumbers findings from F1, from inheriting old fixes.
 */
export function fixRequests(findings: readonly Finding[], requests: readonly ChangeRequest[]): Map<string, ChangeRequest> {
  const out = new Map<string, ChangeRequest>();
  for (const f of findings) {
    const latest = requests.findLast((r) => r.origin.kind === "finding" && r.origin.findingId === f.id && r.origin.findingTitle === f.title);
    if (latest) {
      out.set(f.id, latest);
    }
  }
  return out;
}

export function fixRequest(finding: Finding, requests: readonly ChangeRequest[]): ChangeRequest | undefined {
  return fixRequests([finding], requests).get(finding.id);
}
