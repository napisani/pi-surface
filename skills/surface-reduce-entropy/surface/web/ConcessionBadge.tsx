import { Badge, type Tone } from "../../../../web/kit/primitives/Badge.tsx";
import { CONCESSION_HINT, CONCESSION_LABEL, type Concession } from "../state.ts";

const TONE = { none: "teal", internal: "neutral", edge: "amber", feature: "warn" } satisfies Record<Concession, Tone>;

/** How much accepting a finding gives up, with who would notice on hover. */
export function ConcessionBadge({ concession }: { concession: Concession }) {
  return (
    <Badge tone={TONE[concession]} title={CONCESSION_HINT[concession]}>
      {CONCESSION_LABEL[concession]}
    </Badge>
  );
}
