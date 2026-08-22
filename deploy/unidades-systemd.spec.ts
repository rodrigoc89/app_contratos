import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The systemd units are the only artifacts under `deploy/` that had no spec,
 * and they are the ones that actually run in production. These assertions
 * are static — they parse the unit files rather than starting anything — so
 * they hold on any machine, with or without systemd.
 */
function leerUnidad(nombre: string): Map<string, string[]> {
  const contenido = readFileSync(join(import.meta.dirname, nombre), "utf-8");
  const directivas = new Map<string, string[]>();

  for (const linea of contenido.split("\n")) {
    const recortada = linea.trim();
    if (recortada === "" || recortada.startsWith("#") || recortada.startsWith("[")) {
      continue;
    }
    const separador = recortada.indexOf("=");
    if (separador === -1) continue;
    const clave = recortada.slice(0, separador).trim();
    const valor = recortada.slice(separador + 1).trim();
    directivas.set(clave, [...(directivas.get(clave) ?? []), valor]);
  }

  return directivas;
}

const unaSola = (directivas: Map<string, string[]>, clave: string): string | undefined =>
  directivas.get(clave)?.at(-1);

describe("contratos-backup.service", () => {
  const unidad = leerUnidad("contratos-backup.service");

  it("tells gpg where its keyring is, because ProtectHome hides root's own", () => {
    // `ProtectHome=true` makes /home, /root and /run/user "inaccessible and
    // empty" (systemd.exec). The unit runs as root, and gpg reads its
    // keyring from $HOME/.gnupg — so /root/.gnupg vanishes, gpg creates an
    // empty keyring in the tmpfs, and encrypting to the backup recipient
    // fails with "skipped: No public key". Every scheduled backup fails,
    // every day, and the only person who finds out is whoever needs a
    // restore. Verified locally: gpg with an empty $HOME exits 2 on exactly
    // that error.
    const protectHome = unaSola(unidad, "ProtectHome");
    const user = unaSola(unidad, "User");

    if (protectHome !== "true" || user !== "root") {
      return;
    }

    const environment = unidad.get("Environment") ?? [];
    const gnupgHome = environment
      .map((entrada) => /^"?GNUPGHOME=(.+?)"?$/.exec(entrada)?.[1])
      .find((valor): valor is string => valor !== undefined);

    expect(gnupgHome, "ProtectHome=true with User=root requires an explicit GNUPGHOME").toBeDefined();
    expect(gnupgHome).not.toMatch(/^\/root(\/|$)/);
    expect(gnupgHome).not.toMatch(/^\/home(\/|$)/);

    // ProtectSystem=strict makes the whole filesystem read-only except
    // ReadWritePaths, and gpg writes lockfiles into its keyring directory.
    const readWritePaths = (unidad.get("ReadWritePaths") ?? []).flatMap((valor) => valor.split(/\s+/));
    expect(
      readWritePaths.some((ruta) => gnupgHome === ruta || gnupgHome?.startsWith(`${ruta}/`)),
      `GNUPGHOME '${gnupgHome}' must be under a ReadWritePaths entry: ${readWritePaths.join(", ")}`,
    ).toBe(true);
  });

  it("orders itself after the database it dumps", () => {
    expect(unaSola(unidad, "After")).toContain("postgresql.service");
  });

  it("bounds its own runtime, since a hung run means no backups and no error", () => {
    // Type=oneshot defaults TimeoutStartSec to infinity, and the timer will
    // not start a second run while the first is still going: one wedged
    // rclone push stops every future backup with nothing reported.
    expect(unaSola(unidad, "TimeoutStartSec")).toBeDefined();
  });

  it("is triggered by the timer, never enabled on its own", () => {
    expect(unidad.get("WantedBy")).toBeUndefined();
  });
});

describe("contratos-backup.timer", () => {
  const unidad = leerUnidad("contratos-backup.timer");

  it("runs a backup missed while the host was down instead of skipping that day", () => {
    expect(unaSola(unidad, "Persistent")).toBe("true");
  });

  it("is what gets enabled", () => {
    expect(unaSola(unidad, "WantedBy")).toBe("timers.target");
  });
});
