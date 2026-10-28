import type { Json } from "../../../src/host/decode.ts";

/** The error message a failed response carries: the server's `{ error }`, or the status text. */
export async function serverError(res: Response): Promise<string> {
  const body: Json = await res.json().catch(() => null);
  const error = body instanceof Object && !Array.isArray(body) ? body.error : undefined;
  return error === undefined || error === null ? res.statusText : String(error);
}

/** GETs one of the page's text routes, throwing the server's error message on failure. */
export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(await serverError(res));
  }
  return res.text();
}
