import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

import "@testing-library/jest-dom/vitest";

/**
 * `vitest.config.ts` does not set `globals: true` (matches the rest of the
 * monorepo, which imports `describe`/`it`/`expect` explicitly), so
 * `@testing-library/react`'s automatic cleanup — which relies on a global
 * `afterEach` — never registers itself. Wired here instead: every rendered
 * component is unmounted between tests, so no test leaks DOM nodes into the
 * next one.
 */
afterEach(() => {
  cleanup();
});

/**
 * Node's native `Request` (via undici) validates `init.signal` with a
 * strict `instanceof` brand check against its own internal `AbortSignal`
 * class. Vitest's jsdom environment, however, always installs jsdom's own
 * `AbortController`/`AbortSignal` polyfill as the global one — regardless
 * of Node already having native ones — because `AbortController` is
 * unconditionally forced from `vitest-environment-jsdom`'s key list.
 *
 * `react-router-dom`'s data router (`createBrowserRouter`/
 * `createMemoryRouter`, used since PR2) builds a `new Request(url,
 * { signal })` for every navigation, so any `<Navigate>`/`useNavigate()`
 * call under this test environment crashes with "RequestInit: Expected
 * signal to be an instance of AbortSignal" — a real incompatibility
 * between jsdom and Node's native fetch implementation, not an app bug
 * (reproduced directly with `new AbortController()` + `new Request(...)`,
 * no react-router involved).
 *
 * Fix: build the native `Request` without `signal` (skipping the
 * validation entirely), then reattach the real jsdom signal as a plain own
 * property. Nothing in this app inspects a request's `signal` class
 * identity — only its standard `AbortSignal` behaviour (`.aborted`,
 * `.addEventListener`) — so real navigation behaviour is unaffected.
 */
const RequestNativo = globalThis.Request;

class RequestCompatibleConJsdom extends RequestNativo {
  constructor(entrada: RequestInfo | URL, opciones: RequestInit = {}) {
    const { signal, ...resto } = opciones;
    super(entrada, resto);
    if (signal) {
      Object.defineProperty(this, "signal", { value: signal, configurable: true });
    }
  }
}

globalThis.Request = RequestCompatibleConJsdom;
