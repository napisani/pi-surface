// Which program opens a page: the user's `surface.browser` setting, or the
// platform's default browser.
import { Type } from "typebox";
import { decode, type Json } from "../src/host/decode.ts";

export interface BrowserCommand {
  command: string;
  args: string[];
}

const URL_SLOT = "{url}";

const SurfaceSettings = Type.Object({
  surface: Type.Optional(
    Type.Object({
      browser: Type.Optional(Type.Object({ command: Type.String({ minLength: 1 }), args: Type.Optional(Type.Array(Type.String())) })),
    }),
  ),
});

/** The OS default: `open` on macOS, `xdg-open` elsewhere. */
export function defaultBrowser(platform: NodeJS.Platform): BrowserCommand {
  return { command: platform === "darwin" ? "open" : "xdg-open", args: [URL_SLOT] };
}

/** `surface.browser` from Pi's merged settings, or undefined when unset. Throws SurfaceError naming a malformed field. */
export function configuredBrowser(settings: Json): BrowserCommand | undefined {
  const browser = decode(SurfaceSettings, settings, "settings").surface?.browser;
  return browser ? { command: browser.command, args: browser.args ?? [] } : undefined;
}

/** The argv that opens url: each {url} is replaced, or the url is appended when there is none. */
export function browserArgv(browser: BrowserCommand, url: string): BrowserCommand {
  const slotted = browser.args.some((a) => a.includes(URL_SLOT));
  const args = slotted ? browser.args.map((a) => a.replaceAll(URL_SLOT, url)) : [...browser.args, url];
  return { command: browser.command, args };
}
