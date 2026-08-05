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
