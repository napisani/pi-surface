// Runs workflows the way the Pi extension does, without Pi: a real Surface
// with a host that records what it would persist and send.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { applyPatch, type PatchOp } from "../src/host/patch.ts";
import { spawnRunner } from "../src/host/runner.ts";
import { Surface } from "../src/host/surface.ts";
import type { OpsEntry, SurfaceMessageDetails, WorkflowDefinition, WorkflowSession } from "../src/host/workflow.ts";

export const NOW = "2026-10-23T00:00:00Z";

export interface Notified {
  content: string;
  details: unknown;
}

export function runWorkflow<S, A, Sess extends WorkflowSession<A>>(definition: WorkflowDefinition<S, A, Sess>, webRoot = "/nonexistent") {
  const messages: Notified[] = [];
  const batches: PatchOp[][] = [];
  const opened: string[] = [];
  const surface = new Surface(
    {
      persist: (entry) => batches.push(entry.ops),
      notifyAgent: (_workflow, content, details) => messages.push({ content, details }),
      opened: (url) => opened.push(url),
      runner: spawnRunner,
      now: () => NOW,
    },
    [definition],
    webRoot,
  );
  const { session, store } = surface.typed(definition);
  return {
    surface,
    session,
    store,
    messages,
    batches,
    opened,
    /** The state the persisted batches alone rebuild. */
    replay: () => batches.reduce((state, ops) => applyPatch(state, ops), definition.emptyState()),
    close: () => surface.close(),
  };
}

/** A session entry, as the fake session manager hands them back on resume. */
export interface FakeEntry {
  type: "custom";
  customType: string;
  data: OpsEntry;
}

interface FakeContext {
  mode: string;
  ui: { setStatus(key: string, text: string): void; setWidget(key: string, lines: string[] | undefined, options?: { placement?: string }): void; notify(): void };
  sessionManager: { getBranch(): FakeEntry[] };
}

type Handler = (event: { type: string }, ctx: FakeContext) => void | Promise<void>;

export interface Sent {
  message: { customType: string; content: string; details?: SurfaceMessageDetails };
  options?: { triggerTurn?: boolean; deliverAs?: string };
}

/** What the tests read from a tool result's details. */
interface ToolDetails {
  url: string;
  mode?: string;
  commentId?: string;
  itemId?: string;
  tbds?: number;
}

interface ToolResult {
  content: { type: string; text: string }[];
  details: ToolDetails;
  terminate?: boolean;
}

interface FakeTool {
  name: string;
  defaultActive?: boolean;
  execute<P>(id: string, params: P): Promise<ToolResult>;
}

/** Just enough of ExtensionAPI to drive the real extension without a model. */
export function fakePi() {
  const handlers = new Map<string, Handler[]>();
  const tools = new Map<string, FakeTool>();
  const sent: Sent[] = [];
  const entries: FakeEntry[] = [];
  const statuses = new Map<string, string>();
  const widgets = new Map<string, { lines: string[]; placement?: string }>();
  let active: string[] = [];
  const setActiveCalls: string[][] = [];
  const pi = {
    on: (name: string, handler: Handler) => handlers.set(name, [...(handlers.get(name) ?? []), handler]),
    registerTool: (tool: FakeTool) => {
      tools.set(tool.name, tool);
      if (tool.defaultActive !== false) {
        active.push(tool.name);
      }
    },
    registerCommand: () => undefined,
    registerMessageRenderer: () => undefined,
    sendMessage: (message: Sent["message"], options: Sent["options"]) => sent.push({ message, options }),
    appendEntry: (customType: string, data: OpsEntry) => entries.push({ type: "custom", customType, data }),
    exec: async () => ({ stdout: "", stderr: "", code: 0 }),
    getActiveTools: () => [...active],
    setActiveTools: (names: string[]) => {
      setActiveCalls.push(names);
      active = [...names];
    },
  };
  const ctx = (branch: FakeEntry[]): FakeContext => ({
    mode: "print",
    ui: {
      setStatus: (key: string, text: string) => statuses.set(key, text),
      setWidget: (key: string, lines: string[] | undefined, options?: { placement?: string }) => {
        if (lines) {
          widgets.set(key, { lines, placement: options?.placement });
        } else {
          widgets.delete(key);
        }
      },
      notify: () => undefined,
    },
    sessionManager: { getBranch: () => branch },
  });
  const emit = async (name: string, branch: FakeEntry[] = []) => {
    for (const handler of handlers.get(name) ?? []) {
      // oxlint-disable-next-line no-await-in-loop -- Pi runs an event's handlers one after another
      await handler({ type: name }, ctx(branch));
    }
  };
  // SAFETY: the fake implements every ExtensionAPI call the extension makes in these tests.
  const api: ExtensionAPI = pi as never;
  return { pi: api, tools, sent, entries, statuses, widgets, emit, active: () => active, setActiveCalls };
}
