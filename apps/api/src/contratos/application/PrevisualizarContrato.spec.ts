import { beforeEach, describe, expect, it } from "vitest";

import { ConflictoDeEstado } from "../../shared/domain/ConflictoDeEstado";
import { RecursoNoEncontrado } from "../../shared/domain/RecursoNoEncontrado";
import {
  contextoDePrueba,
  ContratosEnMemoria,
  datosComodatario,
  FIRMA_COMODANTE_PNG,
  firmaDe,
  firmantesFijos,
  GeneradorFalso,
  ID_CONTRATO,
  nuevoBorrador,
  PLANTILLA,
  plantillasFijas,
  relojFijo,
} from "./dobles.testing";
import { FirmarContrato } from "./FirmarContrato";
import { PrevisualizarContrato } from "./PrevisualizarContrato";

/**
 * Step 3 of the signing flow (DESIGN.md §6): the customer reads the documents
 * before signing them.
 *
 * That step is the digital equivalent of *"previa lectura y ratificación"* in
 * the closing clause, and the design insists it must be real rather than a
 * checkbox. So the thing that matters most in this file is not that the
 * preview renders — it is that it renders **the same document the signature
 * will seal**: same template version, same values, same derived expiry date.
 * A customer reading one document and signing another is exactly the failure
 * this step exists to prevent.
 */
describe("PrevisualizarContrato", () => {
  let contratos: ContratosEnMemoria;
  let previsualizar: PrevisualizarContrato;

  beforeEach(() => {
    contratos = new ContratosEnMemoria();
    contratos.agregar(nuevoBorrador());
    previsualizar = new PrevisualizarContrato(
      contratos,
      plantillasFijas(),
      firmantesFijos(),
      relojFijo(),
    );
  });

  const ejecutar = () => previsualizar.ejecutar({ contratoId: ID_CONTRATO });

  describe("what it produces", () => {
    it("renders both documents, because the customer signs twice", async () => {
      const vista = await ejecutar();

      expect(vista.documentos.map((uno) => uno.documento)).toEqual([
        "condiciones_generales",
        "comodato",
      ]);
    });

    it("fills the draft's own values into the legal text", async () => {
      const vista = await ejecutar();
      const comodato = vista.documentos[1]?.html ?? "";

      expect(comodato).toContain("Juan Carlos Pérez");
      expect(comodato).toContain("30.123.456");
      expect(comodato).toContain("Av. Belgrano 1250");
      expect(comodato).toContain("La Banda");
      expect(comodato).toContain("Santiago del Estero");
      expect(comodato).toContain("AC:8B:A9:12:34:56");
      expect(comodato).toContain("LiteBeam 5AC Gen2");
    });

    it("leaves no placeholder unfilled in either document", async () => {
      const vista = await ejecutar();

      for (const documento of vista.documentos) {
        expect(documento.html).not.toMatch(/\{\{/);
      }
    });

    it("reports the template version it rendered from", async () => {
      const vista = await ejecutar();

      expect(vista.plantillaVersion).toBe(PLANTILLA.version);
    });

    it("shows the derived expiry, which is never typed", async () => {
      const vista = await ejecutar();

      expect(vista.fechaPrevistaDeFirma.iso).toBe("2026-08-04");
      expect(vista.fechaPrevistaDeVencimiento.iso).toBe("2036-08-04");
      expect(vista.plazoMeses).toBe(120);
    });
  });

  describe("what it must never carry", () => {
    /**
     * The comodante's signature image is a real person's handwriting.
     * DESIGN.md §4 says it must never reach the public frontend bundle and is
     * to be served server-side only, while rendering the PDF. A preview is
     * HTML sent to a tablet, so it gets a blank image instead.
     */
    it("never sends the comodante's real signature to the tablet", async () => {
      const vista = await ejecutar();

      for (const documento of vista.documentos) {
        expect(documento.html).not.toContain(FIRMA_COMODANTE_PNG);
      }
    });

    it("shows empty signature boxes, because nothing has been signed yet", async () => {
      const vista = await ejecutar();
      const html = vista.documentos.map((uno) => uno.html).join("");

      // Every `src` is the blank pixel; no other image made it in.
      const fuentes = [...html.matchAll(/src="([^"]*)"/g)].map(
        (coincidencia) => coincidencia[1],
      );
      expect(fuentes.length).toBeGreaterThan(0);
      expect(new Set(fuentes).size).toBe(1);
    });

    it("shows no contract number, because the server has not allocated one", async () => {
      const vista = await ejecutar();

      expect(vista.documentos[0]?.html).not.toMatch(/Nº\s*\d/);
    });
  });

  describe("agreement with the signature that follows", () => {
    /**
     * The load-bearing test of this file. It previews, then signs, and checks
     * that the signing use case picked the same template and derived the same
     * dates the customer just read.
     */
    it("previews the very template and dates that FirmarContrato will seal", async () => {
      const vista = await ejecutar();

      const contrato = await new FirmarContrato(
        contratos,
        plantillasFijas(),
        firmantesFijos(),
        new GeneradorFalso(),
        relojFijo(),
      ).ejecutar({
        contratoId: ID_CONTRATO,
        firmas: [firmaDe("condiciones_generales"), firmaDe("comodato")],
        contexto: contextoDePrueba(),
      });

      expect(contrato.plantillaVersionId).toBe(PLANTILLA.id);
      expect(vista.plantillaVersion).toBe(PLANTILLA.version);
      expect(contrato.fechaFirma?.iso).toBe(vista.fechaPrevistaDeFirma.iso);
      expect(contrato.plazo?.fechaVencimiento.iso).toBe(
        vista.fechaPrevistaDeVencimiento.iso,
      );
      expect(contrato.plazo?.meses).toBe(vista.plazoMeses);
    });

    it("reflects an edit made between two previews", async () => {
      const contrato = await contratos.porId(ID_CONTRATO);
      const { Comodatario } = await import("../domain/Comodatario");
      contrato?.actualizarComodatario(
        Comodatario.crear({ ...datosComodatario(), ciudad: "Fernández" }),
      );

      const vista = await ejecutar();

      expect(vista.documentos[1]?.html).toContain("Fernández");
    });
  });

  describe("when it cannot proceed", () => {
    it("reports a contract that does not exist as not found", async () => {
      await expect(
        previsualizar.ejecutar({
          contratoId: "22222222-2222-4222-8222-222222222222",
        }),
      ).rejects.toThrow(RecursoNoEncontrado);
    });

    /**
     * A signed contract has its own sealed PDFs, hashed and stored. Rendering
     * it again against today's date would produce a document that looks
     * official and disagrees with the one that was signed.
     */
    it("refuses to preview a contract that is already signed", async () => {
      await new FirmarContrato(
        contratos,
        plantillasFijas(),
        firmantesFijos(),
        new GeneradorFalso(),
        relojFijo(),
      ).ejecutar({
        contratoId: ID_CONTRATO,
        firmas: [firmaDe("condiciones_generales"), firmaDe("comodato")],
        contexto: contextoDePrueba(),
      });

      await expect(ejecutar()).rejects.toThrow(ConflictoDeEstado);
    });
  });
});
