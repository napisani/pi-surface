import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Box, Text } from "@earendil-works/pi-tui";
import type { Json } from "../src/host/decode.ts";
import { CommandError, spawnRunner } from "../src/host/runner.ts";
import { Surface } from "../src/host/surface.ts";
import { MESSAGE_TYPE, OPS_ENTRY, SurfaceError, type AnyWorkflow, type OpsEntry, type SurfaceMessageDetails, type WorkflowId } from "../src/host/workflow.ts";
import forge from "../skills/surface-forge-solution/surface/workflow.ts";
import review from "../skills/surface-code-review/surface/workflow.ts";
import feedback from "../skills/surface-pr-feedback/surface/workflow.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WEB_ROOT = join(ROOT, "web");

export const WORKFLOWS: AnyWorkflow[] = [forge, review, feedback];
const URL_WIDGET = "surface:url";

/** Registers pi-surface with the given workflows; tests pass their own. */
export function registerSurface(pi: ExtensionAPI, workflows: AnyWorkflow[] = WORKFLOWS) {
  let surface: Surface | undefined;
  let ui: ExtensionContext["ui"] | undefined;
  let hasUI = false;
  const activated = new Set<WorkflowId>();

  const openBrowser = (url: string) => void pi.exec(process.platform === "darwin" ? "open" : "xdg-open", [url]).catch(() => undefined);

  const refreshStatus = (id: WorkflowId) => {
    const running = surface?.workflows.get(id);
    if (!ui || !running?.hasState()) {
      return;
    }
    const status = running.session.status?.();
    if (status === undefined) {
      return;
    }
    ui.setStatus(`surface:${id}`, `surface · ${running.definition.title} · ${status} · /surface ${id}`);
  };

  // Each active workflow's page URL, shown raw under the editor so it can be copied or clicked.
  const pageUrls = new Map<WorkflowId, string>();
  const showUrls = () => ui?.setWidget(URL_WIDGET, pageUrls.size ? [...pageUrls.values()] : undefined, { placement: "belowEditor" });
  const trackUrl = (id: WorkflowId) => {
    const current = surface;
    if (!current?.hasState(id) || pageUrls.has(id)) {
      return;
    }
    void current
      .url(id)
      .then((url) => {
        // A session switch while the server started makes this URL stale.
        if (surface === current) {
          pageUrls.set(id, url);
          showUrls();
        }
      })
      .catch(() => undefined);
  };

  /** Declares a workflow's other tools to the model; never undone, so at most one cache miss per workflow. */
  const activate = (workflow: AnyWorkflow) => {
    if (activated.has(workflow.id)) {
      return;
    }
    activated.add(workflow.id);
    const names = workflow.tools.map((t) => t.name);
    pi.setActiveTools([...new Set([...pi.getActiveTools(), ...names])]);
  };

  pi.on("session_start", async (_event, ctx) => {
    await surface?.close();
    ui = ctx.ui;
    hasUI = ctx.mode === "tui";
    activated.clear();
    pageUrls.clear();
    showUrls();
    // Only the active branch, so abandoned branches' state stays out.
    // SAFETY: only this extension appends OPS_ENTRY entries, and it always appends an OpsEntry.
    const entries = ctx.sessionManager
      .getBranch()
      .flatMap((entry) => (entry.type === "custom" && entry.customType === OPS_ENTRY ? [entry.data as OpsEntry] : []));
    surface = new Surface(
      {
        persist: (entry) => pi.appendEntry(OPS_ENTRY, entry),
        notifyAgent: (workflow, content, action) =>
          pi.sendMessage<SurfaceMessageDetails>(
            { customType: MESSAGE_TYPE, content: `Surface · ${workflow} · ${content}`, display: true, details: { workflow, action } },
            { triggerTurn: true, deliverAs: "followUp" },
          ),
        changed: (id) => {
          refreshStatus(id);
          trackUrl(id);
        },
        opened: (url) => {
          if (hasUI && !process.env.SURFACE_NO_OPEN) {
            openBrowser(url);
          }
        },
        runner: spawnRunner,
      },
      workflows,
      WEB_ROOT,
      entries,
    );
    for (const workflow of workflows) {
      if (!surface.hasState(workflow.id)) {
        continue;
      }
      activate(workflow);
      refreshStatus(workflow.id);
      trackUrl(workflow.id);
    }
  });

  pi.on("session_shutdown", async () => {
    await surface?.close();
    surface = undefined;
    pageUrls.clear();
    showUrls();
  });

  const active = () => {
    if (!surface) {
      throw new Error("pi-surface is not running in this session");
    }
    return surface;
  };

  for (const workflow of workflows) {
    for (const tool of workflow.tools) {
      pi.registerTool({
        name: tool.name,
        label: tool.label,
        description: tool.description,
        promptSnippet: tool.promptSnippet,
        parameters: tool.parameters,
        executionMode: "sequential",
        defaultActive: tool.opens === true,
        async execute(_id, params) {
          if (tool.opens) {
            activate(workflow);
          }
          try {
            // SAFETY: Pi parses tool-call arguments from JSON and checks them against the tool's schema.
            const outcome = await tool.run(active().running(workflow.id).session, params as Json);
            const bundle = join(WEB_ROOT, "dist", `${workflow.id}.js`);
            const unbuilt = tool.opens && !existsSync(bundle) ? `\nWarning: the page bundle is missing; tell the user to run \`npm ci && npm run build\` in ${ROOT}.` : "";
            return {
              content: [{ type: "text" as const, text: outcome.text + unbuilt }],
              details: outcome.details,
              terminate: outcome.terminate,
            };
          } catch (error) {
            // Expected failures become tool errors the model can read and fix.
            if (error instanceof SurfaceError || error instanceof CommandError) {
              throw new Error(error.message);
            }
            throw error;
          }
        },
      });
    }
  }

  pi.registerCommand("surface", {
    description: "Open the pi-surface page for this session, or one workflow's page: /surface [forge|review|feedback]",
    handler: async (args, ctx) => {
      const id = args.trim() || undefined;
      const url = await active().url(id);
      ctx.ui.notify(`surface: ${url}`, "info");
      openBrowser(url);
    },
  });

  pi.registerMessageRenderer<SurfaceMessageDetails>(MESSAGE_TYPE, (message, { outputPad }, theme) => {
    const content = Array.isArray(message.content) ? "" : message.content;
    const workflow = message.details?.workflow ?? "";
    const box = new Box(outputPad, 1, (t) => theme.bg("customMessageBg", t));
    box.addChild(new Text(`${theme.fg("accent", `◆ surface · ${workflow}`)} ${content.split("\n")[0].replace(/^Surface · [^·]+ · /, "")}`, 0, 0));
    return box;
  });
}

export default function surfaceExtension(pi: ExtensionAPI) {
  registerSurface(pi);
}
