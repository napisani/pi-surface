// Page input is decoded once, at the HTTP boundary: JSON in, a value that
// matches a TypeBox schema out, or a SurfaceError naming the field that is wrong.
import { Type, type Static, type TObject, type TSchema } from "typebox";
import { Value } from "typebox/value";
import { SurfaceError } from "./workflow.ts";

/** A value as JSON.parse returns it. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export function decode<T extends TSchema>(schema: T, value: Json, what: string): Static<T> {
  if (Value.Check(schema, value)) {
    return value;
  }
  const [first] = Value.Errors(schema, value);
  if (!first) {
    throw new SurfaceError(`${what} is invalid`);
  }
  const field = first.instancePath ? `"${first.instancePath.slice(1).replaceAll("/", ".")}"` : what;
  const message = first.keyword === "enum" ? `must be one of ${first.params.allowedValues.join(", ")}` : first.message;
  throw new SurfaceError(`${field} ${message}`);
}

const Tagged = Type.Object({ type: Type.String() });

/** Decodes an action against the schema for its `type`, so an error names the field, not the whole union. */
export function decodeAction<M extends Record<string, TObject>>(schemas: M, body: Json): Static<M[keyof M]> {
  const { type } = decode(Tagged, body, "action");
  if (!Object.hasOwn(schemas, type)) {
    throw new SurfaceError(`unknown action type "${type}"`);
  }
  // SAFETY: schemas[type] is M's member under the key `type`, so its value is one member of Static<M[keyof M]>.
  return decode(schemas[type], body, "action") as Static<M[keyof M]>;
}

/** A free-text field trimmed, with blank read as absent. */
export function trimmed(text: string | undefined): string | undefined {
  const value = text?.trim();
  return value || undefined;
}

/** True for every action whose type starts with `prefix`, e.g. "comment." or "finding" (which also covers "findings."). */
export function inArea<A extends { type: string }, P extends string>(action: A, prefix: P): action is Extract<A, { type: `${P}${string}` }> {
  return action.type.startsWith(prefix);
}
