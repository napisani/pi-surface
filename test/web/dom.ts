// Preloaded by `npm run test:web` after tsx: a browser-like global scope for
// component tests, and CSS imports stubbed so components load without esbuild.
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { registerHooks } from "node:module";

GlobalRegistrator.register({ url: "http://127.0.0.1/page/" });
// Tells React that tests wrap updates in act(), so it warns about any that are not.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

// A CSS module's class names read back as their own keys, so tests can assert on them.
const MODULE = "export default new Proxy({}, { get: (_, key) => (typeof key === 'string' ? key : undefined) });";

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.endsWith(".css")) {
      return { url: new URL(specifier, context.parentURL).href, shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith(".css")) {
      return { format: "module", source: url.endsWith(".module.css") ? MODULE : "", shortCircuit: true };
    }
    return next(url, context);
  },
});
