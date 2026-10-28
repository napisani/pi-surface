import type { Json } from "./decode.ts";

/**
 * The subset of RFC 6902 the host emits. Mutations describe themselves as
 * these operations so the browser can replay exactly what changed.
 */
export type PatchOp =
  | { op: "add"; path: string; value: unknown }
  | { op: "replace"; path: string; value: unknown }
  | { op: "remove"; path: string };

/** Ops that add one item, and the id it gets. */
export interface Created {
  id: string;
  ops: PatchOp[];
}

type Container = Json[] | { [key: string]: Json };

function parsePointer(path: string): string[] {
  if (path === "") {
    return [];
  }
  if (!path.startsWith("/")) {
    throw new Error(`invalid JSON pointer: ${path}`);
  }
  return path
    .slice(1)
    .split("/")
    .map((token) => token.replace(/~1/g, "/").replace(/~0/g, "~"));
}

function arrayIndex(token: string, length: number, allowEnd: boolean): number {
  if (allowEnd && token === "-") {
    return length;
  }
  if (!/^(0|[1-9]\d*)$/.test(token)) {
    throw new Error(`invalid array index: ${token}`);
  }
  const index = Number(token);
  if (index > (allowEnd ? length : length - 1)) {
    throw new Error(`array index out of range: ${token}`);
  }
  return index;
}

function isContainer(value: Json | undefined): value is Container {
  return value instanceof Object;
}

/** An op's path split into the containers to walk and the key it changes. */
interface OpPath {
  tokens: string[];
  last: string;
}

function splitPath(op: PatchOp): OpPath {
  const tokens = parsePointer(op.path);
  const last = tokens.pop();
  if (last === undefined) {
    throw new Error("patching the document root is not supported");
  }
  return { tokens, last };
}

function childOf(parent: Container, token: string): Json | undefined {
  return Array.isArray(parent) ? parent[arrayIndex(token, parent.length, false)] : parent[token];
}

/** Applies one op's change to the container that holds its last key. */
function applyAt(parent: Container, last: string, op: PatchOp): void {
  if (op.op === "remove") {
    if (Array.isArray(parent)) {
      parent.splice(arrayIndex(last, parent.length, false), 1);
      return;
    }
    if (!(last in parent)) {
      throw new Error(`path not found: ${op.path}`);
    }
    delete parent[last];
    return;
  }
  // Ops are also persisted and broadcast; the document must not share values.
  // SAFETY: op values are built from state, which is JSON: the session log stores it and the page receives it as JSON.
  const value = structuredClone(op.value) as Json;
  if (Array.isArray(parent)) {
    if (op.op === "add") {
      parent.splice(arrayIndex(last, parent.length, true), 0, value);
    } else {
      parent[arrayIndex(last, parent.length, false)] = value;
    }
    return;
  }
  if (op.op === "replace" && !(last in parent)) {
    throw new Error(`path not found: ${op.path}`);
  }
  parent[last] = value;
}

/**
 * Applies ops in place and returns the same document. Values are copied in.
 * Throws on the first invalid op, leaving earlier ops applied.
 */
export function applyPatch<T>(document: T, ops: readonly PatchOp[]): T {
  // SAFETY: state documents are JSON, for the same reason op values are.
  const root = document as Json;
  for (const op of ops) {
    const { tokens, last } = splitPath(op);
    let parent: Json | undefined = root;
    for (const token of tokens) {
      if (!isContainer(parent)) {
        throw new Error(`path not found: ${op.path}`);
      }
      parent = childOf(parent, token);
    }
    if (!isContainer(parent)) {
      throw new Error(`path not found: ${op.path}`);
    }
    applyAt(parent, last, op);
  }
  return document;
}

/**
 * Applies ops to a copy and returns it, leaving the input untouched. Only the
 * containers on each op's path are copied, so every other object keeps its
 * identity; the page relies on that to skip re-rendering unchanged parts.
 */
export function applyPatchImmutable<T>(document: T, ops: readonly PatchOp[]): T {
  // Containers copied during this call can be mutated again without another copy.
  const fresh = new WeakSet<Container>();
  const own = (value: Container): Container => {
    if (fresh.has(value)) {
      return value;
    }
    const copy = Array.isArray(value) ? value.slice() : { ...value };
    fresh.add(copy);
    return copy;
  };
  // SAFETY: state documents are JSON, for the same reason op values are.
  const input = document as Json;
  if (!isContainer(input)) {
    throw new Error("patching a non-object document is not supported");
  }
  let root = input;
  for (const op of ops) {
    const { tokens, last } = splitPath(op);
    root = own(root);
    let parent = root;
    for (const token of tokens) {
      const next = childOf(parent, token);
      if (!isContainer(next)) {
        throw new Error(`path not found: ${op.path}`);
      }
      const copy = own(next);
      if (Array.isArray(parent)) {
        parent[arrayIndex(token, parent.length, false)] = copy;
      } else {
        parent[token] = copy;
      }
      parent = copy;
    }
    applyAt(parent, last, op);
  }
  // SAFETY: root is a copy of document with the ops applied, which keeps the state's type.
  return root as T;
}

export function pointer(...tokens: (string | number)[]): string {
  return tokens.map((token) => "/" + String(token).replace(/~/g, "~0").replace(/\//g, "~1")).join("");
}
