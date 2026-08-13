import { describe, expect, it } from "vitest";

import { queryClient } from "./providers";

/**
 * R-4.3 / DESIGN.md D11 — `queries.retry` is set explicitly here, visible in
 * exactly one file, the same way `mutations.retry: false` already is. Left
 * implicit, every future query would silently inherit the library's default
 * of 3 attempts, and a failing search would read as frozen rather than
 * failed.
 */
describe("queryClient defaults", () => {
  it("retries a failing query at most once", () => {
    expect(queryClient.getDefaultOptions().queries?.retry).toBe(1);
  });

  it("still never retries a mutation — the one retry mechanism stays conReintentoDeConcurrencia", () => {
    expect(queryClient.getDefaultOptions().mutations?.retry).toBe(false);
  });
});
