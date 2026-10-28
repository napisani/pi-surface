import type { ServerEvent } from "../src/host/server.ts";

/** Reads a workflow event stream the way a browser EventSource would. */
export async function openStream<S = unknown>(url: string) {
  const abort = new AbortController();
  const res = await fetch(url, { signal: abort.signal });
  if (!res.ok || !res.body) {
    throw new Error(`stream failed: ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const queue: ServerEvent<S>[] = [];

  async function next(timeoutMs = 2000): Promise<ServerEvent<S>> {
    const deadline = Date.now() + timeoutMs;
    while (queue.length === 0) {
      const frame = buffer.indexOf("\n\n");
      if (frame >= 0) {
        const chunk = buffer.slice(0, frame);
        buffer = buffer.slice(frame + 2);
        const data = chunk.split("\n").filter((l) => l.startsWith("data: ")).map((l) => l.slice(6)).join("\n");
        if (data) {
          queue.push(JSON.parse(data));
        }
        continue;
      }
      if (Date.now() > deadline) {
        throw new Error("timed out waiting for a server event");
      }
      // oxlint-disable-next-line no-await-in-loop -- a stream is read one chunk after another
      const read = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timed out waiting for a server event")), deadline - Date.now())),
      ]);
      if (read.done) {
        throw new Error("stream closed");
      }
      buffer += decoder.decode(read.value, { stream: true });
    }
    return queue.shift()!;
  }

  return { next, close: () => abort.abort() };
}

export function postAction<A>(url: string, body: A, origin = new URL(url).origin) {
  return fetch(new URL("action", url), { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify(body) });
}
