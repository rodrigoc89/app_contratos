import type { DatosContratoDetalle } from "@contratos/esquemas";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

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
    eventos: [
      { tipo: "firmado", fecha: "2026-08-05", detalle: "Nº 42", usuario: null },
    ],
    equiposPendientesDeRestitucion: false,
  };
}

describe("EntregaDeDocumentos", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * PR26 — design.md "Toast" category: exactly "Documentos compartidos
   * correctamente." becomes an auto-dismissing, dismissible toast — the
   * download-fallback message stays a plain, persistent status line
   * ("and nothing else").
   */
  it("dismisses the share-confirmation toast on tap, before its auto-dismiss timer", async () => {
    const usuario = userEvent.setup();
    const entregar = vi.fn<(contrato: DatosContratoDetalle) => Promise<ResultadoEntrega>>().mockResolvedValue({
      via: "compartido",
    });

    render(<EntregaDeDocumentos contrato={contratoSellado()} entregar={entregar} />);
    await usuario.click(screen.getByRole("button", { name: "Compartir documentos" }));
    await screen.findByRole("status");

    await usuario.click(screen.getByRole("button", { name: "Cerrar aviso" }));

    expect(screen.queryByText(/compartidos correctamente/)).not.toBeInTheDocument();
  });

  /**
   * Verification-by-breaking (d) guard, this container's own progress
   * message: "Preparando los documentos…" stays a progress indicator, not
   * a toast — no auto-dismiss.
   */
  it("never auto-dismisses the Preparando los documentos progress message", async () => {
    const entregar = vi
      .fn<(contrato: DatosContratoDetalle) => Promise<ResultadoEntrega>>()
      .mockReturnValue(new Promise(() => {}));

    render(<EntregaDeDocumentos contrato={contratoSellado()} entregar={entregar} />);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    fireEvent.click(screen.getByRole("button", { name: "Compartir documentos" }));

    expect(screen.getByRole("status")).toHaveTextContent("Preparando los documentos");
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByRole("status")).toHaveTextContent("Preparando los documentos");
  });

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

/**
 * Reported as "por qué ya no puedo hacerlo". Measured on the running app: the
 * técnico taps "Compartir documentos" once and the button is gone — for good.
 *
 *   antes de tocar → botones: ["Cerrar sesión", "Compartir documentos"]
 *   después        → botones: ["Cerrar sesión"]
 *
 * Both SUCCESS paths ended in a terminal state with no action left; only
 * failure offered a retry. That is backwards for this screen. DESIGN.md §8:
 * *"the customer is entitled to their copy"* — and "no me llegó", a wrong
 * chat, or a WhatsApp that silently dropped the attachment are the most
 * ordinary things that can happen while the técnico is still standing there.
 *
 * Sharing again is free and has no side effect on the contract: it is
 * already sealed, and delivery only ever reads the PDFs back.
 */
describe("EntregaDeDocumentos — se puede volver a enviar", () => {
  it("keeps the action after a successful share", async () => {
    const entregar = vi
      .fn<(contrato: DatosContratoDetalle) => Promise<ResultadoEntrega>>()
      .mockResolvedValue({ via: "compartido" });
    render(<EntregaDeDocumentos contrato={contratoSellado()} entregar={entregar} />);

    await userEvent.click(screen.getByRole("button", { name: "Compartir documentos" }));

    expect(await screen.findByRole("button", { name: "Compartir de nuevo" })).toBeInTheDocument();
  });

  it("keeps the action after falling back to a download", async () => {
    const entregar = vi
      .fn<(contrato: DatosContratoDetalle) => Promise<ResultadoEntrega>>()
      .mockResolvedValue({ via: "descarga" });
    render(<EntregaDeDocumentos contrato={contratoSellado()} entregar={entregar} />);

    await userEvent.click(screen.getByRole("button", { name: "Compartir documentos" }));

    expect(await screen.findByRole("button", { name: "Compartir de nuevo" })).toBeInTheDocument();
    expect(screen.getByText(/Adjuntalos manualmente por WhatsApp/)).toBeInTheDocument();
  });

  it("actually delivers again when asked again", async () => {
    const entregar = vi
      .fn<(contrato: DatosContratoDetalle) => Promise<ResultadoEntrega>>()
      .mockResolvedValue({ via: "descarga" });
    render(<EntregaDeDocumentos contrato={contratoSellado()} entregar={entregar} />);

    await userEvent.click(screen.getByRole("button", { name: "Compartir documentos" }));
    await userEvent.click(await screen.findByRole("button", { name: "Compartir de nuevo" }));

    expect(entregar).toHaveBeenCalledTimes(2);
  });

  /**
   * The download message is the standing instruction for what to do next, so
   * it must survive a second attempt rather than blinking out and back.
   */
  it("still explains the download after sharing again", async () => {
    const entregar = vi
      .fn<(contrato: DatosContratoDetalle) => Promise<ResultadoEntrega>>()
      .mockResolvedValue({ via: "descarga" });
    render(<EntregaDeDocumentos contrato={contratoSellado()} entregar={entregar} />);

    await userEvent.click(screen.getByRole("button", { name: "Compartir documentos" }));
    await userEvent.click(await screen.findByRole("button", { name: "Compartir de nuevo" }));

    expect(await screen.findByText(/Adjuntalos manualmente por WhatsApp/)).toBeInTheDocument();
  });
});
