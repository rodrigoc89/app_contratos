import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

/**
 * The shared `QueryClient`. `mutations.retry` is set explicitly to `false`
 * here — not left to the library default — so there is exactly one retry
 * mechanism in this app: `conReintentoDeConcurrencia` (DESIGN.md D3a). A
 * future `retry: 1` on a mutation becomes a visible diff instead of a
 * silent doubling of network attempts.
 *
 * `queries.retry: 1` (R-4.3, DESIGN.md D11) — set globally, the same way,
 * for the opposite reason: left implicit, every future query would silently
 * inherit the library's default of 3 attempts, and a failing search would
 * read as frozen rather than failed.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
    },
    mutations: {
      retry: false,
    },
  },
});

interface PropiedadesProviders {
  readonly children: ReactNode;
}

export function Providers({ children }: PropiedadesProviders) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
