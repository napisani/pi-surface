import { applyPatch, type PatchOp } from "./patch.ts";

export type Listener<S> = (ops: PatchOp[], state: S) => void;

/** A workflow's state document. Every change goes through apply, so listeners see every op. */
export class Store<S> {
  state: S;
  #listeners = new Set<Listener<S>>();

  constructor(state: S) {
    this.state = state;
  }

  apply(ops: PatchOp[]): void {
    if (!ops.length) {
      return;
    }
    applyPatch(this.state, ops);
    for (const listener of this.#listeners) {
      listener(ops, this.state);
    }
  }

  subscribe(listener: Listener<S>): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
}
