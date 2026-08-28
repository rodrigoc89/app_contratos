import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `nginx.conf` is a template rendered by `tls-bootstrap.sh`, and real nginx
 * needs root, a certificate and a live host — untestable here (design.md D8),
 * exactly like the scripts' non `--dry-run` steps. What IS assertable without
 * a VPS is the text of the template itself, which is where the two traps this
 * file keeps stepping on live: `add_header` inheritance and the MIME type map.
 *
 * `tls-bootstrap.spec.ts` already covers the placeholder render. These specs
 * cover the static content decisions the render leaves untouched.
 */
const NGINX_CONF = join(import.meta.dirname, "nginx.conf");

/**
 * Returns the body of the `location` block whose header line matches, brace to
 * brace. A plain `includes()` on the whole file would happily pass on a
 * directive that sits in some other block — which for `types` is precisely the
 * failure mode being guarded against.
 */
function bloqueDeLocation(conf: string, cabecera: string): string {
  const inicio = conf.indexOf(cabecera);
  expect(inicio, `no existe el bloque \`${cabecera}\``).toBeGreaterThanOrEqual(0);

  let profundidad = 0;
  for (let i = conf.indexOf("{", inicio); i < conf.length; i += 1) {
    if (conf[i] === "{") profundidad += 1;
    if (conf[i] === "}") {
      profundidad -= 1;
      if (profundidad === 0) return conf.slice(inicio, i + 1);
    }
  }

  throw new Error(`el bloque \`${cabecera}\` no cierra`);
}

describe("nginx.conf", () => {
  it("serves the web app manifest as application/manifest+json", async () => {
    // nginx's stock `mime.types` has no `.webmanifest` entry, so without this
    // the manifest goes out as `application/octet-stream` — and this server
    // also sends `X-Content-Type-Options: nosniff`, which forbids the browser
    // from recovering the type by sniffing. Chrome installs the PWA anyway
    // today; that is tolerance, not correctness.
    const conf = await readFile(NGINX_CONF, "utf8");
    const bloque = bloqueDeLocation(conf, "location = /manifest.webmanifest");

    expect(bloque).toContain("application/manifest+json");
  });

  it("keeps the manifest's type map inside its own location", async () => {
    // The `types` trap, and the reason the assertion above is scoped: a `types`
    // block REPLACES the inherited map rather than extending it. Declared at
    // `server` level it would take `mime.types` out of play for the whole
    // origin, and every stylesheet, script and icon would start going out as
    // `application/octet-stream` — the exact bug this fix set out to remove,
    // multiplied across the app.
    const conf = await readFile(NGINX_CONF, "utf8");
    const bloqueManifest = bloqueDeLocation(conf, "location = /manifest.webmanifest");

    const bloquesDeTipos = conf.match(/\btypes\s*\{/g) ?? [];
    expect(bloquesDeTipos.length, "hay un bloque `types` fuera del manifest").toBe(
      bloqueManifest.match(/\btypes\s*\{/g)?.length ?? 0,
    );
  });

  it("does not set its own add_header on the manifest, so the security headers stay inherited", async () => {
    // The file's standing rule: a location that declares any `add_header` loses
    // every header inherited from the server block. This location deliberately
    // declares none. If a `Cache-Control` is ever wanted here, the three
    // security headers have to be copied in with it — as `/sw.js`,
    // `/index.html` and `/assets/` all do.
    const conf = await readFile(NGINX_CONF, "utf8");
    const bloque = bloqueDeLocation(conf, "location = /manifest.webmanifest");

    expect(bloque).not.toContain("add_header");
  });
});
