import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

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

/**
 * provision.sh installs these units from the checkout, so every path a unit
 * needs to exist must be one provision.sh creates — read from its own
 * dry-run plan, never restated here. With ProtectSystem=strict systemd
 * bind-mounts each ReadWritePaths entry before ExecStart; a path that does
 * not exist fails the start with status=226/NAMESPACE (seen on the real
 * host, gap #7), and no `mkdir -p` inside the script can help by then.
 */
async function directoriosQueProvisionCrea(): Promise<{
  appDir: string | undefined;
  directorios: string[];
}> {
  const { stdout } = await execFileAsync(join(import.meta.dirname, "provision.sh"), ["--dry-run"]);
  const appDir = /^== provision\.sh plan for (.+) \(dry-run=/m.exec(stdout)?.[1];
  const directorios = [...stdout.matchAll(/^\[(?:plan|skip)\] .*directory '([^']+)'/gm)]
    .map((coincidencia) => coincidencia[1])
    .filter((ruta): ruta is string => ruta !== undefined);
  return { appDir, directorios };
}

const rutasDeEscritura = (unidad: Map<string, string[]>): string[] =>
  (unidad.get("ReadWritePaths") ?? []).flatMap((valor) => valor.split(/\s+/));

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

  it("only names directories provision.sh creates in ReadWritePaths and GNUPGHOME", async () => {
    // On the real host /etc/contratos/gnupg did not exist when the timer
    // was installed; backup.sh creates its work directory itself, but under
    // this unit the namespace is assembled first, so both have to be
    // provisioned ahead of the first run.
    const { directorios } = await directoriosQueProvisionCrea();
    const gnupgHome = (unidad.get("Environment") ?? [])
      .map((entrada) => /^"?GNUPGHOME=(.+?)"?$/.exec(entrada)?.[1])
      .find((valor): valor is string => valor !== undefined);

    for (const ruta of rutasDeEscritura(unidad)) {
      expect(directorios, `ReadWritePaths entry '${ruta}'`).toContain(ruta);
    }
    expect(directorios, `GNUPGHOME '${gnupgHome}'`).toContain(gnupgHome);
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

describe("contratos-api.service", () => {
  const unidad = leerUnidad("contratos-api.service");

  it("grants write access to the exact directory provision.sh creates for the documents", async () => {
    // provision.sh installs this unit from the checkout, so the repository
    // copy is what runs. On the real host it named /srv/contratos/documentos
    // while provision.sh (DOCUMENT_STORE_DIR) and backup.sh create
    // /opt/contratos/var/documentos; systemd could not mount a path that
    // does not exist and the first deploy died with status=226/NAMESPACE.
    // The default is read from provision.sh's own plan, not restated here:
    // the document store is the one directory it creates under $APP_DIR.
    const { appDir, directorios } = await directoriosQueProvisionCrea();
    const documentStoreDir = directorios.find(
      (ruta) => ruta !== appDir && ruta.startsWith(`${appDir}/`),
    );
    expect(documentStoreDir).toBeDefined();

    expect(rutasDeEscritura(unidad)).toEqual([documentStoreDir]);
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
