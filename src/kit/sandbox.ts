// The document an agent-built view runs in. The page shows it in an iframe with
// sandbox="allow-scripts" and no allow-same-origin, so the view gets an opaque
// origin: it cannot read the page, its token, or call the server. The policy
// below also blocks every network request. Pure, so the Node tests cover it.

export const VIEW_POLICY = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'";
export const MAX_VIEW_HTML = 200_000;

/** Messages between the page and a view. The page sends data; the view reports its height. */
export const VIEW_DATA = "surface-view-data";
export const VIEW_HEIGHT = "surface-view-height";

// Runs before the agent's markup: hands posted data to the view as window.surfaceData
// plus a "surface-data" event, and reports the document height so the iframe can size itself.
const BOOTSTRAP = `<script>
addEventListener("message", (e) => {
  if (e.source === parent && e.data && e.data.type === "${VIEW_DATA}") {
    window.surfaceData = e.data.data;
    dispatchEvent(new CustomEvent("surface-data", { detail: e.data.data }));
  }
});
new ResizeObserver(() => parent.postMessage({ type: "${VIEW_HEIGHT}", height: document.documentElement.scrollHeight }, "*")).observe(document.documentElement);
</script>
<style>:root{color-scheme:dark}body{margin:0;background:#181616;color:#c5c9c5;font:13px/1.45 system-ui,sans-serif}</style>`;

/**
 * Wraps agent HTML so the content policy and bootstrap come first. The policy
 * meta must precede every agent script, so a doctype the agent wrote is dropped
 * and the agent's own html and head tags merge into the parser's.
 */
export function sandboxDocument(html: string): string {
  const body = html.replace(/^\s*<!doctype[^>]*>/i, "");
  return `<!doctype html><meta http-equiv="Content-Security-Policy" content="${VIEW_POLICY}"><meta charset="utf-8">${BOOTSTRAP}${body}`;
}
