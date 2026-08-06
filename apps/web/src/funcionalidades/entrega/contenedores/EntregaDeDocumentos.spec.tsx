import type { DatosContratoDetalle } from "@contratos/esquemas";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ResultadoEntrega } from "../logica/entregaDeDocumentos";
import { EntregaDeDocumentos } from "./EntregaDeDocumentos";

/**
 * PR15's own job (per `sdd/pwa-firma-comodato/tasks`): compose the delivery
 * screen onto `EnvioDeFirma`'s "firmado" state. This container owns only UI
 * state around `entregarDocumentos` (PR15 logic) — the "compartir" action,
 * its outcomes, and DESIGN.md D11's rule that a cancelled share (AbortError,
 * surfaced here as `via: "cancelado"`) leaves the share action available
 * again instead of showing an error.
 */

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
    eventos: [{ tipo: "firmado", fecha: "2026-08-05", detalle: "Nº 42" }],
    equiposPendientesDeRestitucion: false,
  };
}

describe("EntregaDeDocumentos", () => {
  it("shows a confirmation once the documents are shared successfully", async () => {
    const usuario = userEvent.setup();
    const entregar = vi.fn<(contrato: DatosContratoDetalle) => Promise<ResultadoEntrega>>().mockResolvedValue({
      via: "compartido",
    });

    render(<EntregaDeDocumentos contrato={contratoSellado()} entregar={entregar} />);
    await usuario.click(screen.getByRole("button", { name: "Compartir documentos" }));

    expect(await screen.findByRole("status")).toHaveTextContent("compartidos correctamente");
    expect(entregar).toHaveBeenCalledWith(contratoSellado());
  });

  it("shows the manual-attach instruction when delivery falls back to a download", async () => {
    const usuario = userEvent.setup();
    const entregar = vi.fn<(contrato: DatosContratoDetalle) => Promise<ResultadoEntrega>>().mockResolvedValue({
      via: "descarga",
    });

    render(<EntregaDeDocumentos contrato={contratoSellado()} entregar={entregar} />);
    await usuario.click(screen.getByRole("button", { name: "Compartir documentos" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Adjuntalos manualmente");
  });

  it(
    "keeps the share action available and shows no error when the technician cancels the share sheet " +
      "(AbortError, DESIGN.md D11)",
    async () => {
      const usuario = userEvent.setup();
      const entregar = vi.fn<(contrato: DatosContratoDetalle) => Promise<ResultadoEntrega>>().mockResolvedValue({
        via: "cancelado",
      });

      render(<EntregaDeDocumentos contrato={contratoSellado()} entregar={entregar} />);
      await usuario.click(screen.getByRole("button", { name: "Compartir documentos" }));

      // Give any stray re-render a chance to settle before asserting absence.
      await new Promise((resolver) => setTimeout(resolver, 0));
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Compartir documentos" })).toBeEnabled();
    },
  );

  it("shows a retry affordance when preparing the documents fails outright", async () => {
    const usuario = userEvent.setup();
    const entregar = vi.fn<(contrato: DatosContratoDetalle) => Promise<ResultadoEntrega>>().mockRejectedValue(
      new Error("la red falló"),
    );

    render(<EntregaDeDocumentos contrato={contratoSellado()} entregar={entregar} />);
    await usuario.click(screen.getByRole("button", { name: "Compartir documentos" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudieron preparar los documentos");
    expect(screen.getByRole("button", { name: "Compartir documentos" })).toBeEnabled();
  });
});
