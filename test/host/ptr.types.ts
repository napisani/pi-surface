// Checked by tsc, never run: each @ts-expect-error must stay an error, so a
// regression in the pointer types fails the typecheck.
import { replace, at, child, type Ptr } from "../../src/host/ptr.ts";
import { sendRound, type RoundWork } from "../../src/kit/rounds.ts";

interface Fix extends RoundWork {
  files: string[];
}
interface Feedback {
  items: { id: string; fix?: Fix }[];
  requests: (RoundWork & { id: string })[];
}

const f = at<Feedback>();

sendRound([f("items", 2, "fix"), f("requests", 0)], 1);

// @ts-expect-error a segment that is not a key of the value reached so far
f("items", 2, "fx");

// @ts-expect-error a pointer to an item, not to round work
sendRound([f("items", 2)], 1);

// @ts-expect-error a value of the wrong type for the field
replace(child(f("items", 0, "fix"), "status"), "bogus");

// @ts-expect-error a number where the state has an array index
f("items", "first");

const fix: Ptr<Feedback, Fix> = f("items", 1, "fix");
replace(child(fix, "status"), "sent");
