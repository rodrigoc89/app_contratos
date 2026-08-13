import type { DatosContratoDetalle, DatosSesion } from "@contratos/esquemas";
import { afterEach, describe, expect, it, vi } from "vitest";

import { establecerSesion, limpiarSesion } from "../../../datos/sesion/estadoSesion";
import { entregarDocumentos } from "./entregaDeDocumentos";

/**
 * DESIGN.md D11 — delivery. This spec proves two things:
 *
 * 1. The threat-matrix N/A carried forward as a design requirement: every
 *    `URL.createObjectURL` in the download fallback is paired with a
 *    `revokeObjectURL` — on the path where sharing works, the path where the
 *    technician cancels the OS share sheet, and the path where it downloads
 *    instead. This is the decisive proof of this slice.
 * 2. `AbortError` from `navigator.share` (the technician cancelling) is
 *    never treated as an error — it must not fall through to a forced
 *    download, unlike every other share failure.
 */

function sesionFalsa(): DatosSesion {
  return {
    tokenDeAcceso: "acceso",
    expiraEnSegundos: 900,
    tokenDeRefresco: "refresco",
    refrescoExpiraEnSegundos: 2_592_000,
    usuario: { id: "u1", nombreUsuario: "tecnico1", nombreCompleto: "Técnico", rol: "tecnico", activo: true },
  };
}

function contratoSellado(): DatosContratoDetalle {
  return {
    id: "c1",
    estado: "vigente",
    numero: 42,
    comodatario: {
      nombreCompleto: "Ana López",
      dni: "30.123.456",
      domicilioCalle: "San Martín 123",
      ciudad: "Santiago del Estero",
      provincia: "Santiago del Estero",
      whatsapp: "385 4123456",
    },
    equipos: { antenaModelo: "Ubiquiti LiteBeam", antenaMac: "AC:8B:A9:12:34:56", poe: true, canoMetros: 7.5 },
    plazo: { meses: 12, fechaInicio: "2026-08-05", fechaVencimiento: "2027-08-05" },
    fechaFirma: "2026-08-05",
    plantillaVersionId: "v1",
    documentos: [
      { documento: "condiciones_generales", sha256: "a".repeat(64), enlace: "/contratos/c1/documentos/condiciones_generales" },
      { documento: "comodato", sha256: "b".repeat(64), enlace: "/contratos/c1/documentos/comodato" },
    ],
    eventos: [
      { tipo: "firmado", fecha: "2026-08-05", detalle: "Nº 42", usuario: null },
    ],
    equiposPendientesDeRestitucion: false,
  };
}

function fetchDePdfs(): ReturnType<typeof vi.fn> {
  return vi.fn().mockImplementation((ruta: unknown) => {
    return Promise.resolve(
      new Response(`contenido de ${String(ruta)}`, {
        status: 200,
        headers: { "Content-Type": "application/pdf" },
      }),
    );
  });
}

/** Real `URL.createObjectURL`/`revokeObjectURL` are absent in jsdom. */
function espiarObjectUrl(): { crear: ReturnType<typeof vi.fn>; revocar: ReturnType<typeof vi.fn> } {
  let contador = 0;
  const crear = vi.fn(() => `blob:objeto-${(contador += 1)}`);
  const revocar = vi.fn();
  vi.stubGlobal("URL", { ...URL, createObjectURL: crear, revokeObjectURL: revocar });
  return { crear, revocar };
}

describe("entregarDocumentos", () => {
  afterEach(() => {
    establecerSesion(sesionFalsa());
    limpiarSesion();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it(
    "pairs every createObjectURL with a revokeObjectURL across the shared, cancelled, and downloaded " +
      "paths — the threat-matrix carry-over this slice exists to prove",
    async () => {
      establecerSesion(sesionFalsa());
      vi.stubGlobal("fetch", fetchDePdfs());
      const { crear, revocar } = espiarObjectUrl();
      const enlace = document.createElement("a");
      vi.spyOn(enlace, "click").mockImplementation(() => {});
      vi.spyOn(document, "createElement").mockReturnValue(enlace);

      // (a) Sharing succeeds — no object URL should ever be created.
      vi.stubGlobal("navigator", {
        ...navigator,
        canShare: () => true,
        share: vi.fn().mockResolvedValue(undefined),
      });
      await entregarDocumentos(contratoSellado());

      // (b) The technician cancels the share sheet — still no object URL.
      vi.stubGlobal("navigator", {
        ...navigator,
        canShare: () => true,
        share: vi.fn().mockRejectedValue(new DOMException("cancelado", "AbortError")),
      });
      await entregarDocumentos(contratoSellado());

      // (c) Sharing is unavailable — falls back to downloading both files.
      vi.stubGlobal("navigator", { ...navigator, canShare: undefined, share: undefined });
      await entregarDocumentos(contratoSellado());

      expect(crear).toHaveBeenCalledTimes(2);
      expect(revocar).toHaveBeenCalledTimes(2);
      const creadas = crear.mock.results.map((resultado) => resultado.value as string);
      const revocadas = revocar.mock.calls.map((llamada) => llamada[0] as string);
      expect(revocadas.sort()).toEqual(creadas.sort());
    },
  );

  it("shares both files via navigator.share and creates no object URL when canShare accepts them", async () => {
    establecerSesion(sesionFalsa());
    vi.stubGlobal("fetch", fetchDePdfs());
    const { crear } = espiarObjectUrl();
    const compartir = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, canShare: () => true, share: compartir });

    const resultado = await entregarDocumentos(contratoSellado());

    expect(resultado).toEqual({ via: "compartido" });
    expect(compartir).toHaveBeenCalledTimes(1);
    const [datos] = compartir.mock.calls[0] as [{ files: File[] }];
    expect(datos.files).toHaveLength(2);
    expect(crear).not.toHaveBeenCalled();
  });

  it("treats a cancelled share (AbortError) as no error and does not force a download — the share action stays available", async () => {
    establecerSesion(sesionFalsa());
    vi.stubGlobal("fetch", fetchDePdfs());
    const { crear } = espiarObjectUrl();
    vi.stubGlobal("navigator", {
      ...navigator,
      canShare: () => true,
      share: vi.fn().mockRejectedValue(new DOMException("El usuario canceló.", "AbortError")),
    });

    const resultado = await entregarDocumentos(contratoSellado());

    expect(resultado).toEqual({ via: "cancelado" });
    expect(crear).not.toHaveBeenCalled();
  });

  it("falls back to downloading when share fails for a reason other than cancellation", async () => {
    establecerSesion(sesionFalsa());
    vi.stubGlobal("fetch", fetchDePdfs());
    const { crear, revocar } = espiarObjectUrl();
    const enlace = document.createElement("a");
    vi.spyOn(enlace, "click").mockImplementation(() => {});
    vi.spyOn(document, "createElement").mockReturnValue(enlace);
    vi.stubGlobal("navigator", {
      ...navigator,
      canShare: () => true,
      share: vi.fn().mockRejectedValue(new Error("share genuinely failed")),
    });

    const resultado = await entregarDocumentos(contratoSellado());

    expect(resultado).toEqual({ via: "descarga" });
    expect(crear).toHaveBeenCalledTimes(2);
    expect(revocar).toHaveBeenCalledTimes(2);
  });

  it("tries sharing one document at a time when canShare refuses the two files together", async () => {
    establecerSesion(sesionFalsa());
    vi.stubGlobal("fetch", fetchDePdfs());
    const compartir = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      ...navigator,
      canShare: ({ files }: { files: File[] }) => files.length === 1,
      share: compartir,
    });

    const resultado = await entregarDocumentos(contratoSellado());

    expect(resultado).toEqual({ via: "compartido" });
    expect(compartir).toHaveBeenCalledTimes(2);
    expect((compartir.mock.calls[0] as [{ files: File[] }])[0].files).toHaveLength(1);
    expect((compartir.mock.calls[1] as [{ files: File[] }])[0].files).toHaveLength(1);
  });

  it("fetches each sealed document through the authenticated Blob client, using its own enlace", async () => {
    establecerSesion(sesionFalsa());
    const fetchSimulado = fetchDePdfs();
    vi.stubGlobal("fetch", fetchSimulado);
    vi.stubGlobal("navigator", { ...navigator, canShare: undefined, share: undefined });
    const enlace = document.createElement("a");
    vi.spyOn(enlace, "click").mockImplementation(() => {});
    vi.spyOn(document, "createElement").mockReturnValue(enlace);
    espiarObjectUrl();

    await entregarDocumentos(contratoSellado());

    const rutasLlamadas = fetchSimulado.mock.calls.map((llamada: unknown[]) => llamada[0] as string);
    expect(rutasLlamadas).toEqual([
      "/contratos/c1/documentos/condiciones_generales",
      "/contratos/c1/documentos/comodato",
    ]);
    for (const llamada of fetchSimulado.mock.calls as [string, RequestInit][]) {
      const encabezados = new Headers(llamada[1].headers);
      expect(encabezados.get("Authorization")).toBe("Bearer acceso");
      expect(encabezados.get("Accept")).toBe("application/pdf");
    }
  });

  it("still revokes the object URL if writing the download itself throws — the pairing holds under failure too", async () => {
    establecerSesion(sesionFalsa());
    vi.stubGlobal("fetch", fetchDePdfs());
    const { crear, revocar } = espiarObjectUrl();
    const enlace = document.createElement("a");
    vi.spyOn(enlace, "click").mockImplementation(() => {
      throw new Error("no se pudo iniciar la descarga");
    });
    vi.spyOn(document, "createElement").mockReturnValue(enlace);
    vi.stubGlobal("navigator", { ...navigator, canShare: undefined, share: undefined });

    await expect(entregarDocumentos(contratoSellado())).rejects.toThrow("no se pudo iniciar la descarga");

    expect(crear).toHaveBeenCalledTimes(1);
    expect(revocar).toHaveBeenCalledTimes(1);
    expect(revocar).toHaveBeenCalledWith(crear.mock.results[0]?.value);
  });
});
