import { describe, expect, it } from "vitest";

import { queryClient } from "./providers";

/**
 * Scenario 16 (spec `web-app-shell`, DESIGN.md D3a): behavioural tests alone
 * cannot catch a later `retry: 1` on the `firmar` mutation — the
 * concurrency-retry wrapper's own count would still read as one while a
 * second, silent network attempt doubled underneath it. This asserts the
 * shared `QueryClient` configuration directly.
 */
describe("shared QueryClient configuration", () => {
  it("disables automatic mutation retries, so conReintentoDeConcurrencia owns the only retry", () => {
    expect(queryClient.getDefaultOptions().mutations?.retry).toBe(false);
  });
});
