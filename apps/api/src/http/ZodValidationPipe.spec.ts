import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ZodValidationPipe } from "./ZodValidationPipe";

const EsquemaCliente = z.object({
  nombreCompleto: z.string().min(1),
  dni: z.string().regex(/^\d{7,8}$/, "El DNI tiene que tener 7 u 8 dígitos."),
  metros: z.coerce.number().positive(),
});

const pipe = new ZodValidationPipe(EsquemaCliente);

const metadatos = { type: "body" as const, metatype: undefined, data: undefined };

describe("ZodValidationPipe", () => {
  it("returns the parsed value when the input satisfies the schema", () => {
    const salida = pipe.transform(
      { nombreCompleto: "Juan Pérez", dni: "27582030", metros: "12.5" },
      metadatos,
    );

    expect(salida).toEqual({
      nombreCompleto: "Juan Pérez",
      dni: "27582030",
      metros: 12.5,
    });
  });

  // The schemas are shared with the React client (DESIGN.md §5.1). If the
  // server silently kept extra keys, the two sides would agree on the fields
  // they validate and disagree on everything else.
  it("drops keys the schema does not declare", () => {
    const salida = pipe.transform(
      {
        nombreCompleto: "Juan Pérez",
        dni: "27582030",
        metros: 1,
        rol: "admin",
      },
      metadatos,
    );

    expect(salida).not.toHaveProperty("rol");
  });

  it("rejects invalid input with a 400", () => {
    expect(() => pipe.transform({ nombreCompleto: "" }, metadatos)).toThrow(
      BadRequestException,
    );
  });

  it("names every offending field at once", () => {
    const error = capturar(() =>
      pipe.transform({ nombreCompleto: "", dni: "abc" }, metadatos),
    );

    const cuerpo = error?.getResponse() as {
      error: { campos: Record<string, string> };
    };

    expect(Object.keys(cuerpo.error.campos).sort()).toEqual([
      "dni",
      "metros",
      "nombreCompleto",
    ]);
    expect(cuerpo.error.campos["dni"]).toContain("7 u 8 dígitos");
  });

  it("reports nested paths in a form a form library can use", () => {
    const anidado = new ZodValidationPipe(
      z.object({ comodatario: z.object({ dni: z.string().min(7) }) }),
    );

    const error = capturar(() =>
      anidado.transform({ comodatario: { dni: "1" } }, metadatos),
    );
    const cuerpo = error?.getResponse() as {
      error: { campos: Record<string, string> };
    };

    expect(cuerpo.error.campos).toHaveProperty("comodatario.dni");
  });

  // Ley 25.326: the DNI, the phone number and the address are personal data.
  // A validation error travels to logs and to error trackers, so it carries
  // the name of the field that is wrong and never the value that was sent.
  it("never echoes the submitted value back", () => {
    const error = capturar(() =>
      pipe.transform(
        { nombreCompleto: "Juan Pérez", dni: "SECRETO-12345678", metros: 1 },
        metadatos,
      ),
    );

    expect(JSON.stringify(error?.getResponse())).not.toContain(
      "SECRETO-12345678",
    );
    expect(JSON.stringify(error?.getResponse())).not.toContain("Juan Pérez");
  });

  it("rejects a body that is not an object at all", () => {
    expect(() => pipe.transform("no soy un objeto", metadatos)).toThrow(
      BadRequestException,
    );
    expect(() => pipe.transform(undefined, metadatos)).toThrow(
      BadRequestException,
    );
  });

  it("stays generic: any Zod schema works, not just objects", () => {
    const listaDePipes = new ZodValidationPipe(z.array(z.string().min(1)));

    expect(listaDePipes.transform(["a", "b"], metadatos)).toEqual(["a", "b"]);
    expect(() => listaDePipes.transform(["a", ""], metadatos)).toThrow(
      BadRequestException,
    );
  });

  it("answers in Spanish, since a technician reads it", () => {
    const error = capturar(() => pipe.transform({}, metadatos));
    const cuerpo = error?.getResponse() as { error: { mensaje: string } };

    expect(cuerpo.error.mensaje).toMatch(/datos|revis|complet/i);
  });

  /**
   * A scalar schema — a path parameter, a query string — has no field path of
   * its own, so the issue arrives with an empty `path`. NestJS knows the name
   * anyway and hands it over in `ArgumentMetadata.data`; using it is what
   * turns `{"(cuerpo)": "…"}` into `{"tipo": "…"}` for a caller who has no
   * way of guessing which of several parameters was refused.
   */
  describe("a value that is not a body", () => {
    const tipos = new ZodValidationPipe(z.enum(["comodato"]));

    it("names the parameter NestJS says it was validating", () => {
      const error = capturar(() =>
        tipos.transform("../../etc/passwd", {
          type: "param",
          metatype: undefined,
          data: "tipo",
        }),
      );
      const cuerpo = error?.getResponse() as {
        error: { campos: Record<string, string> };
      };

      expect(Object.keys(cuerpo.error.campos)).toEqual(["tipo"]);
    });

    it("still says something when there is no name to use", () => {
      const error = capturar(() => tipos.transform("nada", metadatos));
      const cuerpo = error?.getResponse() as {
        error: { campos: Record<string, string> };
      };

      expect(Object.keys(cuerpo.error.campos)).toEqual(["(cuerpo)"]);
    });

    it("never echoes the rejected parameter, which is caller-controlled", () => {
      const error = capturar(() =>
        tipos.transform("../../etc/passwd", {
          type: "param",
          metatype: undefined,
          data: "tipo",
        }),
      );

      expect(JSON.stringify(error?.getResponse())).not.toContain("passwd");
    });
  });
});

function capturar(accion: () => unknown): BadRequestException | null {
  try {
    accion();
    return null;
  } catch (error) {
    return error as BadRequestException;
  }
}
