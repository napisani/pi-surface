import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";
import type { Json } from "./decode.ts";
import type { PatchOp } from "./patch.ts";
import { CommandError } from "./runner.ts";
import type { Store } from "./store.ts";
import { SurfaceError, type AnyWorkflow, type WorkflowSession } from "./workflow.ts";

/** What the server needs to serve one workflow's page. */
export interface ServedWorkflow {
  definition: AnyWorkflow;
  store: Store<unknown>;
  session: WorkflowSession<unknown>;
  /** True once the workflow has state; the index page lists only these. */
  hasState(): boolean;
}

export interface SurfaceServerOptions {
  workflows: ReadonlyMap<string, ServedWorkflow>;
  webRoot: string;
  port?: number;
  token?: string;
}

export interface SurfaceServer {
  /** The index page; a workflow's page is `${url}${id}/`. */
  url: string;
  close(): Promise<void>;
}

/**
 * Server-to-browser events, shaped like AG-UI's STATE_SNAPSHOT and
 * STATE_DELTA so another AG-UI client could attach.
 */
export type ServerEvent<S = unknown> = { type: "STATE_SNAPSHOT"; snapshot: S } | { type: "STATE_DELTA"; delta: PatchOp[] };

const MAX_BODY = 256 * 1024;
const HEARTBEAT_MS = 15_000;
const DIST_FILE = /^[A-Za-z0-9_-]+\.(js|css|map)$/;
const CONTENT_TYPES = new Map([
  ["js", "text/javascript; charset=utf-8"],
  ["css", "text/css; charset=utf-8"],
  ["map", "application/json"],
]);

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function send(res: ServerResponse, status: number, body: Json): void {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

function sendText(res: ServerResponse, body: string, type = "text/plain; charset=utf-8"): void {
  res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
}

async function readJson(req: IncomingMessage): Promise<Json> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    const data = Buffer.from(chunk);
    size += data.length;
    if (size > MAX_BODY) {
      throw new SurfaceError("request body too large");
    }
    chunks.push(data);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new SurfaceError("request body is not valid JSON");
  }
}

function shell(id: string, title: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="../dist/${id}.css">
<link rel="icon" href="data:,">
</head>
<body data-workflow="${escapeHtml(id)}">
<div id="app"></div>
<script type="module" src="../dist/${id}.js"></script>
</body>
</html>`;
}

function index(workflows: ReadonlyMap<string, ServedWorkflow>): string {
  const open = [...workflows.values()].filter((w) => w.hasState());
  const items = open.length
    ? open.map((w) => `<li><a href="${escapeHtml(w.definition.id)}/">${escapeHtml(w.definition.title)}</a></li>`).join("")
    : "<li>Nothing is open in this session yet.</li>";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>pi-surface</title><link rel="icon" href="data:,">
<style>body{margin:40px;background:#12120f;color:#c5c9c5;font:15px/1.5 system-ui,sans-serif}a{color:#8ba4b0}h1{font:600 16px ui-monospace,monospace;color:#c4b28a}</style>
</head><body><h1>pi-surface</h1><ul>${items}</ul></body></html>`;
}

/**
 * Serves one session's workflow pages on loopback and returns the index URL.
 * The random path token keeps other local users out; Host and Origin checks
 * stop DNS rebinding and cross-site posts, which matters because a post can
 * reach GitHub or run git.
 */
export async function startSurfaceServer(options: SurfaceServerOptions): Promise<SurfaceServer> {
  const token = options.token ?? randomBytes(18).toString("base64url");
  const clients = new Set<ServerResponse>();
  let port = 0;
  const allowedHosts = () => new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const allowedOrigins = () => new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);

  const serveDist = async (res: ServerResponse, name: string) => {
    if (!DIST_FILE.test(name)) {
      return send(res, 404, { error: "not found" });
    }
    const body = await readFile(join(options.webRoot, "dist", name)).catch(() => undefined);
    if (!body) {
      return send(res, 404, { error: "page bundle missing; run npm run build in pi-surface" });
    }
    res.writeHead(200, { "content-type": CONTENT_TYPES.get(name.split(".").pop() ?? "") ?? "application/octet-stream", "cache-control": "no-store" });
    res.end(body);
  };

  const streamEvents = (res: ServerResponse, workflow: ServedWorkflow) => {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
    res.write(`data: ${JSON.stringify({ type: "STATE_SNAPSHOT", snapshot: workflow.store.state } satisfies ServerEvent)}\n\n`);
    const unsubscribe = workflow.store.subscribe((delta) => res.write(`data: ${JSON.stringify({ type: "STATE_DELTA", delta } satisfies ServerEvent)}\n\n`));
    clients.add(res);
    res.on("close", () => {
      unsubscribe();
      clients.delete(res);
    });
  };

  const postAction = async (req: IncomingMessage, res: ServerResponse, workflow: ServedWorkflow) => {
    if (!allowedOrigins().has(req.headers.origin ?? "")) {
      return send(res, 403, { error: "forbidden origin" });
    }
    if (!(req.headers["content-type"] ?? "").startsWith("application/json")) {
      return send(res, 415, { error: "expected application/json" });
    }
    const action = workflow.definition.parseAction(await readJson(req));
    await workflow.session.handleAction(action);
    send(res, 202, { ok: true });
  };

  /** Everything under /<token>/<id>/: the page, its event stream, actions and text routes. */
  const serveWorkflow = async (req: IncomingMessage, res: ServerResponse, workflow: ServedWorkflow, base: string, rest: string[], query: URLSearchParams) => {
    const route = rest.join("/");
    const get = req.method === "GET";
    if (get && rest.length === 0) {
      res.writeHead(302, { location: `${base}/` });
      return res.end();
    }
    if (get && route === "") {
      return sendText(res, shell(workflow.definition.id, workflow.definition.title), "text/html; charset=utf-8");
    }
    if (get && route === "events") {
      return streamEvents(res, workflow);
    }
    if (req.method === "POST" && route === "action") {
      return postAction(req, res, workflow);
    }
    const handler = get && rest[0] === "r" && rest.length === 2 ? workflow.session.routes?.[rest[1]] : undefined;
    if (handler) {
      return sendText(res, await handler(query));
    }
    const known = get || req.method === "POST";
    send(res, known ? 404 : 405, { error: known ? "not found" : "method not allowed" });
  };

  const server = createServer(async (req, res) => {
    try {
      if (!allowedHosts().has(req.headers.host ?? "")) {
        return send(res, 403, { error: "forbidden host" });
      }
      const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
      const prefix = `/${token}/`;
      if (url.pathname === `/${token}`) {
        res.writeHead(302, { location: prefix });
        return res.end();
      }
      if (!url.pathname.startsWith(prefix)) {
        return send(res, 404, { error: "not found" });
      }
      const [first = "", ...rest] = url.pathname.slice(prefix.length).split("/");
      if (req.method === "GET" && first === "") {
        return sendText(res, index(options.workflows), "text/html; charset=utf-8");
      }
      if (req.method === "GET" && first === "dist") {
        return serveDist(res, rest.join("/"));
      }
      const workflow = options.workflows.get(first);
      if (!workflow) {
        return send(res, 404, { error: "not found" });
      }
      await serveWorkflow(req, res, workflow, `${prefix}${first}`, rest, url.searchParams);
    } catch (error) {
      if (error instanceof SurfaceError || error instanceof CommandError) {
        return send(res, 400, { error: error.message });
      }
      send(res, 500, { error: "internal error" });
    }
  });

  const heartbeat = setInterval(() => {
    for (const client of clients) {
      client.write(": keep-alive\n\n");
    }
  }, HEARTBEAT_MS);
  heartbeat.unref();

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  // A TCP server reports an AddressInfo; a string would mean a pipe or socket path.
  if (!(address instanceof Object)) {
    throw new Error("surface server has no TCP address");
  }
  port = address.port;

  let closed = false;
  return {
    url: `http://127.0.0.1:${port}/${token}/`,
    async close() {
      if (closed) {
        return;
      }
      closed = true;
      clearInterval(heartbeat);
      for (const client of clients) {
        client.end();
      }
      clients.clear();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
