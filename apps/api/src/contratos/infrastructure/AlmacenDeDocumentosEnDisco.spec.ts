import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AlmacenDeDocumentosEnDisco } from "./AlmacenDeDocumentosEnDisco";

describe("AlmacenDeDocumentosEnDisco", () => {
  let raiz: string;
  let almacen: AlmacenDeDocumentosEnDisco;

  beforeEach(async () => {
    raiz = await mkdtemp(join(tmpdir(), "almacen-documentos-"));
    almacen = new AlmacenDeDocumentosEnDisco(raiz);
  });

  afterEach(async () => {
    await rm(raiz, { recursive: true, force: true });
  });

  it("writes the exact bytes it was given", async () => {
    const contenido = new Uint8Array([1, 2, 3, 4, 5]);

    await almacen.guardar("1042/comodato.pdf", contenido);

    const leido = await readFile(join(raiz, "1042/comodato.pdf"));
    expect(new Uint8Array(leido)).toEqual(contenido);
  });

  it("creates the intermediate directories the path needs", async () => {
    await almacen.guardar(
      `${randomUUID()}/condiciones_generales.pdf`,
      new Uint8Array([9]),
    );
    // No throw: mkdir(recursive) + writeFile both succeeded.
  });

  it("rejects an absolute path", async () => {
    await expect(
      almacen.guardar("/etc/passwd", new Uint8Array([1])),
    ).rejects.toThrow(/relativa/);
  });

  it("rejects a path that escapes the store root via traversal", async () => {
    await expect(
      almacen.guardar("../fuera-del-almacen.pdf", new Uint8Array([1])),
    ).rejects.toThrow(/fuera del almacén/);
  });

  it("rejects a path that escapes even when it starts inside the root", async () => {
    await expect(
      almacen.guardar("1042/../../fuera.pdf", new Uint8Array([1])),
    ).rejects.toThrow(/fuera del almacén/);
  });
});
