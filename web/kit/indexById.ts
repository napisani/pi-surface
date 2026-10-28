// Copy-on-write snapshots keep an unchanged array's identity, so a map built
// for one array stays valid until that array is replaced.
const cache = new WeakMap<readonly unknown[], ReadonlyMap<unknown, unknown>>();

/** A map from id to item, built once per array. */
export function indexById<T extends { id: string | number }>(items: readonly T[]): ReadonlyMap<T["id"], T> {
  // SAFETY: the map cached under an array was built from that array's items by this function.
  let map = cache.get(items) as ReadonlyMap<T["id"], T> | undefined;
  if (!map) {
    map = new Map(items.map((item) => [item.id, item]));
    cache.set(items, map);
  }
  return map;
}
