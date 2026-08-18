import type { DatosDocumentoDisponible, DatosSesion } from "@contratos/esquemas";
import { afterEach, describe, expect, it, vi } from "vitest";

import { establecerSesion, limpiarSesion } from "./sesion/estadoSesion";
import { descargarDocumento, descargarPdf, guardarArchivo } from "./descargaDeArchivo";

/**
 * These assertions used to live in `entregaDeDocumentos.spec.ts`, which
 * proved them through the técnico's delivery flow. That flow was removed
 * (DESIGN.md §8, decided 2026-08-18) and this module survived it: the office
 * panel's Descargar action is now the only way a customer's copy leaves the
 * system, which makes these properties more load-bearing than they were, not
 * less. They are asserted against this module directly so no future caller
 * can take the proof with it when it goes.
 *
 * 1. The threat-matrix N/A carried forward as a design requirement: every
 *    `URL.createObjectURL` is paired with a `revokeObjectURL`, including when
 *    writing the download itself throws.
 * 2. The endpoint is authenticated, so the download must carry the bearer
 *    token. A plain `<a href>` would answer 401.
 */

function sesionFalsa(): DatosSesion {
  return {
    tokenDeAcceso: "acceso",
    expiraEnSegundos: 900,
    tokenDeRefresco: "refresco",
    refrescoExpiraEnSegundos: 2_592_000,
    usuario: { id: "u1", nombreUsuario: "oficina1", nombreCompleto: "Oficina", rol: "oficina", activo: true },
  };
}

function documentoSellado(): DatosDocumentoDisponible {
  return {
    documento: "comodato",
    sha256: "b".repeat(64),
    enlace: "/contratos/c1/documentos/comodato",
  };
}

function fetchDePdfs(): ReturnType<typeof vi.fn> {
  return vi.fn().mockImplementation((ruta: unknown) =>
    Promise.resolve(
      new Response(`contenido de ${String(ruta)}`, {
        status: 200,
        headers: { "Content-Type": "application/pdf" },
      }),
    ),
  );
}

/** Real `URL.createObjectURL`/`revokeObjectURL` are absent in jsdom. */
function espiarObjectUrl(): { crear: ReturnType<typeof vi.fn>; revocar: ReturnType<typeof vi.fn> } {
  let contador = 0;
  const crear = vi.fn(() => `blob:objeto-${(contador += 1)}`);
  const revocar = vi.fn();
  vi.stubGlobal("URL", { ...URL, createObjectURL: crear, revokeObjectURL: revocar });
  return { crear, revocar };
}

/** Replaces the `<a>` the download builds, so jsdom never navigates. */
function enlaceSimulado(alHacerClic: () => void = () => {}): HTMLAnchorElement {
  const enlace = document.createElement("a");
  vi.spyOn(enlace, "click").mockImplementation(alHacerClic);
  vi.spyOn(document, "createElement").mockReturnValue(enlace);
  return enlace;
}

describe("descargaDeArchivo", () => {
  afterEach(() => {
    limpiarSesion();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("revokes the object URL it created once the download is written", () => {
    const { crear, revocar } = espiarObjectUrl();
    enlaceSimulado();

    guardarArchivo(new File(["pdf"], "comodato.pdf", { type: "application/pdf" }));

    expect(crear).toHaveBeenCalledTimes(1);
    expect(revocar).toHaveBeenCalledTimes(1);
    expect(revocar).toHaveBeenCalledWith(crear.mock.results[0]?.value);
  });

  it("still revokes the object URL if writing the download itself throws — the pairing holds under failure too", () => {
    const { crear, revocar } = espiarObjectUrl();
    enlaceSimulado(() => {
      throw new Error("no se pudo iniciar la descarga");
    });

    expect(() => guardarArchivo(new File(["pdf"], "comodato.pdf", { type: "application/pdf" }))).toThrow(
      "no se pudo iniciar la descarga",
    );

    expect(crear).toHaveBeenCalledTimes(1);
    expect(revocar).toHaveBeenCalledTimes(1);
    expect(revocar).toHaveBeenCalledWith(crear.mock.results[0]?.value);
  });

  it("fetches the sealed document through the authenticated Blob client, using its own enlace", async () => {
    establecerSesion(sesionFalsa());
    const fetchSimulado = fetchDePdfs();
    vi.stubGlobal("fetch", fetchSimulado);

    const archivo = await descargarPdf(documentoSellado());

    expect(archivo.name).toBe("comodato.pdf");
    expect(archivo.type).toBe("application/pdf");
    const [ruta, init] = fetchSimulado.mock.calls[0] as [string, RequestInit];
    expect(ruta).toBe("/contratos/c1/documentos/comodato");
    const encabezados = new Headers(init.headers);
    expect(encabezados.get("Authorization")).toBe("Bearer acceso");
    expect(encabezados.get("Accept")).toBe("application/pdf");
  });

  it("fetches and saves in one step, pairing the object URL, when the panel taps Descargar", async () => {
    establecerSesion(sesionFalsa());
    vi.stubGlobal("fetch", fetchDePdfs());
    const { crear, revocar } = espiarObjectUrl();
    enlaceSimulado();

    await descargarDocumento(documentoSellado());

    expect(crear).toHaveBeenCalledTimes(1);
    expect(revocar).toHaveBeenCalledTimes(1);
  });
});
