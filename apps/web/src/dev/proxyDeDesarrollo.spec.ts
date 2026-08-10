import { describe, expect, it } from "vitest";

import { OPCIONES_VITE_PLUGIN_PWA } from "../pwa/configuracionPwa";
import { PREFIJOS_DE_API, PROXY_DE_DESARROLLO } from "./proxyDeDesarrollo";

describe("proxyDeDesarrollo", () => {
  it("routes every API prefix to the API's own port, not to Vite", () => {
    for (const prefijo of PREFIJOS_DE_API) {
      const entrada = PROXY_DE_DESARROLLO[prefijo];
      expect(entrada, `falta el prefijo ${prefijo} en el proxy`).toBeDefined();
      expect(entrada?.target).toBe("http://localhost:3000");
    }
  });

  it("does not rewrite the path — the API owns these prefixes verbatim", () => {
    // A `rewrite` that stripped the prefix would make `/auth/login` arrive as
    // `/login`, which no controller answers. The whole point of the
    // same-origin design is that the path the client writes is the path the
    // server sees, in dev exactly as behind Nginx.
    for (const prefijo of PREFIJOS_DE_API) {
      expect(PROXY_DE_DESARROLLO[prefijo]?.rewrite).toBeUndefined();
    }
  });

  /**
   * The drift guard. Three separate places have to agree on what belongs to
   * the API rather than to the SPA: this proxy, the service worker's
   * navigation-fallback denylist, and `deploy/nginx.conf`'s `location`
   * blocks. Nginx lives outside this test's reach, but the denylist does not
   * — and a prefix present there yet missing here means the dev server would
   * answer an API call with `index.html` while production answers it with
   * JSON, which is the worst kind of difference to debug.
   */
  it("covers every prefix the service worker excludes from its navigation fallback", () => {
    const denylist = OPCIONES_VITE_PLUGIN_PWA.workbox?.navigateFallbackDenylist ?? [];
    expect(denylist.length).toBeGreaterThan(0);

    for (const patron of denylist) {
      const cubierto = PREFIJOS_DE_API.some((prefijo) => patron.test(prefijo));
      expect(cubierto, `el service worker excluye ${patron} y el proxy no lo cubre`).toBe(true);
    }
  });
});
