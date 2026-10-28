// A two-tool workflow small enough to test the host with.
import { Type, type Static } from "typebox";
import { decodeAction } from "../../src/host/decode.ts";
import { at, replace } from "../../src/host/ptr.ts";
import { defineSurfaceTool, defineWorkflow, SurfaceError, type SurfaceContext, type WorkflowSession } from "../../src/host/workflow.ts";

export interface CounterState {
  count: number;
}
const ACTIONS = { bump: Type.Object({ type: Type.Literal("bump") }), fail: Type.Object({ type: Type.Literal("fail") }) };
export type CounterAction = Static<(typeof ACTIONS)[keyof typeof ACTIONS]>;

const c = at<CounterState>();

export class CounterSession implements WorkflowSession<CounterAction> {
  readonly ctx: SurfaceContext<CounterState>;
  readonly routes = { echo: async (query: URLSearchParams) => `echo:${query.get("q")}` };
  constructor(ctx: SurfaceContext<CounterState>) {
    this.ctx = ctx;
  }
  status() {
    return `${this.ctx.store.state.count} bumps`;
  }
  bump() {
    this.ctx.commit([replace(c("count"), this.ctx.store.state.count + 1)]);
  }
  async handleAction(action: CounterAction) {
    if (action.type === "fail") {
      throw new SurfaceError("refused");
    }
    this.bump();
    this.ctx.notifyAgent(`bumped to ${this.ctx.store.state.count}`, action);
  }
}

export function counter(id = "counter") {
  return defineWorkflow<CounterState, CounterAction, CounterSession>({
    id,
    title: `${id} page`,
    emptyState: () => ({ count: 0 }),
    parseAction: (body) => decodeAction(ACTIONS, body),
    tools: [
      defineSurfaceTool({
        name: `surface_${id}_open`,
        label: "open",
        description: "open",
        opens: true,
        parameters: Type.Object({}),
        async run(session: CounterSession) {
          return { text: await session.ctx.url(), details: { url: await session.ctx.url() }, terminate: true };
        },
      }),
      defineSurfaceTool({
        name: `surface_${id}_bump`,
        label: "bump",
        description: "bump",
        parameters: Type.Object({ fail: Type.Optional(Type.Boolean()) }),
        run(session: CounterSession, params) {
          if (params.fail) {
            throw new SurfaceError("cannot bump");
          }
          session.bump();
          return { text: "bumped" };
        },
      }),
    ],
    create: (ctx) => new CounterSession(ctx),
  });
}
