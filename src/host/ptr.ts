// JSON pointers that carry the type of the state they point into and of the
// value they reach, so a bad segment or a wrong value fails tsc. At runtime a
// Ptr is the plain pointer string the patch log stores.
import type { PatchOp } from "./patch.ts";

type Seg = string | number;
type Step<T, K> = T extends readonly (infer E)[] ? (K extends number ? E : never) : K extends keyof T ? T[K] : never;

// Optional fields drop undefined, since a pointer reaches a value that is there; null stays settable.
export type ValueAt<T, P extends readonly Seg[]> = P extends readonly [infer H, ...infer R extends Seg[]]
  ? R extends []
    ? Exclude<Step<NonNullable<T>, H>, undefined>
    : ValueAt<NonNullable<Step<NonNullable<T>, H>>, R>
  : T;

// Each segment must be a key of the value reached so far; the error then names the allowed keys.
export type ValidPath<T, P extends readonly Seg[]> = P extends readonly [infer H, ...infer R extends Seg[]]
  ? NonNullable<T> extends readonly unknown[]
    ? [number, ...ValidPath<Step<NonNullable<T>, number>, R>]
    : [H & keyof NonNullable<T> extends never ? keyof NonNullable<T> & string : H, ...ValidPath<NonNullable<Step<NonNullable<T>, H>>, R>]
  : [];

declare const brand: unique symbol;
export type Ptr<S, V> = string & { readonly [brand]: [S, V] };

const token = (key: Seg) => "/" + String(key).replace(/~/g, "~0").replace(/\//g, "~1");

/** A pointer builder for one state type: at<State>()("items", 2, "fix"). */
/** Brands a pointer string; every builder below goes through it. */
function brandPtr<S, V>(pointer: string): Ptr<S, V> {
  // SAFETY: the brand exists only in types; each caller derives the pointer from segments it has typed against S.
  return pointer as Ptr<S, V>;
}

export const at =
  <S>() =>
  <const P extends Seg[]>(...keys: P & ValidPath<S, P>): Ptr<S, ValueAt<S, P>> =>
    brandPtr(keys.map(token).join(""));

export function child<S, V, K extends keyof NonNullable<V> & string>(p: Ptr<S, V>, key: K): Ptr<S, Exclude<NonNullable<V>[K], undefined>> {
  return brandPtr(p + token(key));
}

export function item<S, V>(p: Ptr<S, readonly V[]>, index: number): Ptr<S, V> {
  return brandPtr(p + token(index));
}

export function add<S, V>(p: Ptr<S, V>, value: NoInfer<V>): PatchOp {
  return { op: "add", path: p, value };
}

export function replace<S, V>(p: Ptr<S, V>, value: NoInfer<V>): PatchOp {
  return { op: "replace", path: p, value };
}

/** Appends to the array at p. */
export function append<S, V>(p: Ptr<S, readonly V[]>, value: NoInfer<V>): PatchOp {
  return { op: "add", path: `${p}/-`, value };
}

export function remove<S, V>(p: Ptr<S, V>): PatchOp {
  return { op: "remove", path: p };
}
