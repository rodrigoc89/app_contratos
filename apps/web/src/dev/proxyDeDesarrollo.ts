import type { ProxyOptions } from "vite";

/**
 * The prefixes the API owns. Everything else belongs to the SPA.
 *
 * Taken from the server's own decorators — `@Controller("auth")`,
 * `@Controller(RUTA_CONTRATOS)` (= `"contratos"`) and `@Controller("salud")`.
 * This same list appears in two other places that must agree with it:
 * the service worker's `navigateFallbackDenylist`
 * (`pwa/configuracionPwa.ts`) and the `location` blocks in
 * `deploy/nginx.conf`. `proxyDeDesarrollo.spec.ts` guards the first pair;
 * the Nginx one is outside a test's reach and is called out in that file's
 * own comments.
 */
export const PREFIJOS_DE_API = ["/auth", "/contratos", "/salud"] as const;

/**
 * The app is same-origin by design (DESIGN.md §10): the client writes
 * `/auth/login`, never `http://localhost:3000/auth/login`, so there is no
 * CORS anywhere and no base URL to configure per environment. In production
 * Nginx is what makes that true. In development nothing did — Vite answered
 * `/auth/login` with its own SPA fallback, so a login attempt got `index.html`
 * where it expected JSON.
 *
 * This is that missing half. Deliberately no `rewrite`: the path the client
 * writes is the path the server sees, in dev exactly as behind Nginx.
 *
 * `changeOrigin` stays false on purpose — the API is on the same host here,
 * and rewriting the `Host` header would hide a difference from production
 * rather than reproduce it.
 */
export const PROXY_DE_DESARROLLO: Record<string, ProxyOptions> = Object.fromEntries(
  PREFIJOS_DE_API.map((prefijo) => [prefijo, { target: "http://localhost:3000" }]),
);
