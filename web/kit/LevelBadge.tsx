import type { Level } from "../../src/kit/levels.ts";
import { Badge, LEVEL_TONE } from "./primitives/Badge.tsx";

/** A Low/Medium/High rating, colored so High stands out. */
export function LevelBadge({ name, level, title }: { name: string; level: Level; title: string }) {
  return (
    <Badge tone={LEVEL_TONE[level]} title={title}>
      {name} {level}
    </Badge>
  );
}
