import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { describe, expect, it } from "vitest";

import {
  CredencialesInvalidas,
  SesionInvalida,
} from "../identidad/domain/ErroresDeIdentidad";
import { ConflictoDeEstado } from "../shared/domain/ConflictoDeEstado";
import { DomainError } from "../shared/domain/DomainError";
import { EstadoAlmacenadoInconsistente } from "../shared/domain/EstadoAlmacenadoInconsistente";
import { RecursoNoEncontrado } from "../shared/domain/RecursoNoEncontrado";
import { respuestaDeError } from "./respuestaDeError";

const REFERENCIA = "ref-de-prueba";

describe("respuestaDeError", () => {
  describe("identity errors", () => {
    it("maps a failed login to 401", () => {
      const { estado, cuerpo } = respuestaDeError(
        new CredencialesInvalidas(),
        REFERENCIA,
      );

      expect(estado).toBe(401);
      expect(cuerpo.error.mensaje).toBe("Usuario o contraseña incorrectos.");
      expect(cuerpo.error.codigo).toBe("credenciales_invalidas");
    });

    it("maps a dead session to 401", () => {
      expect(respuestaDeError(new SesionInvalida(), REFERENCIA).estado).toBe(401);
    });
  });

  describe("domain errors", () => {
    it("maps a plain rule violation to 400", () => {
      const { estado, cuerpo } = respuestaDeError(
        new DomainError("El campo nombre completo es obligatorio."),
        REFERENCIA,
      );

      expect(estado).toBe(400);
      expect(cuerpo.error.mensaje).toBe(
        "El campo nombre completo es obligatorio.",
      );
      expect(cuerpo.error.codigo).toBe("regla_de_negocio");
    });

    // A request that is well formed but arrives at the wrong moment in the
    // contract's life. The domain says so by throwing `ConflictoDeEstado`;
    // this layer does not re-derive it from the wording.
    it("maps a state conflict to 409", () => {
      const { estado, cuerpo } = respuestaDeError(
        new ConflictoDeEstado(
          "El contrato no se puede firmar porque ya está vigente.",
        ),
        REFERENCIA,
      );

      expect(estado).toBe(409);
      expect(cuerpo.error.codigo).toBe("conflicto_de_estado");
      expect(cuerpo.error.mensaje).toBe(
        "El contrato no se puede firmar porque ya está vigente.",
      );
    });

    /**
     * `ConflictoDeEstado` extends `DomainError`, so an `instanceof DomainError`
     * branch placed first would swallow it and answer 400. This test is the one
     * that fails if the two checks are ever reordered.
     */
    it("checks the subclass before the base class", () => {
      // Deliberately worded like nothing in particular: only the type may
      // decide, so a message with no state vocabulary must still be 409.
      const { estado, cuerpo } = respuestaDeError(
        new ConflictoDeEstado("No."),
        REFERENCIA,
      );

      expect(estado).toBe(409);
      expect(cuerpo.error.codigo).toBe("conflicto_de_estado");
    });

    /**
     * A contract id that names nothing is not a bad field and not a bad
     * moment — there is simply no such resource. 400 would send a technician
     * hunting for a typo in a form they filled in correctly.
     */
    it("maps a missing resource to 404", () => {
      const { estado, cuerpo } = respuestaDeError(
        new RecursoNoEncontrado("No existe el contrato solicitado."),
        REFERENCIA,
      );

      expect(estado).toBe(404);
      expect(cuerpo.error.codigo).toBe("no_encontrado");
      expect(cuerpo.error.mensaje).toBe("No existe el contrato solicitado.");
    });

    it("checks the not-found subclass before the base class too", () => {
      expect(
        respuestaDeError(new RecursoNoEncontrado("No."), REFERENCIA).estado,
      ).toBe(404);
    });

    /**
     * The mirror of the test above, and the reason the old message-matching
     * heuristic had to go: prose that reads exactly like a state conflict is
     * still a 400 when the domain typed it as a plain rule violation.
     */
    it("does not promote a plain rule violation to 409 because of its wording", () => {
      const { estado, cuerpo } = respuestaDeError(
        new DomainError("Solo se puede dar de baja un contrato vigente."),
        REFERENCIA,
      );

      expect(estado).toBe(400);
      expect(cuerpo.error.codigo).toBe("regla_de_negocio");
    });

    it.each([
      "El campo ciudad es obligatorio.",
      'El hash "xx" no es un SHA-256 válido.',
      "La latitud capturada no es válida.",
      "El número de contrato 0 no es válido: lo asigna el servidor y tiene que ser un entero positivo.",
      "Falta la firma de Condiciones Generales de Uso.",
      "La ruta del documento tiene que ser relativa al almacén y no puede salir de él.",
    ])("keeps the input error %# at 400", (mensaje) => {
      expect(respuestaDeError(new DomainError(mensaje), REFERENCIA).estado).toBe(
        400,
      );
    });
  });

  /**
   * Corrupt stored data is a bug or a broken row, never something the caller
   * did. 400 and 409 would both tell a technician to fix something that is not
   * theirs to fix, so this answers 500 — and, unlike every other `DomainError`,
   * is flagged unexpected so the filter logs the whole thing.
   */
  describe("corrupt stored state", () => {
    const inconsistente = (): EstadoAlmacenadoInconsistente =>
      new EstadoAlmacenadoInconsistente(
        "El contrato almacenado 1111-2222 es inconsistente: un contrato firmado tiene que tener número.",
      );

    it("answers 500, not 400 and not 409", () => {
      const { estado, cuerpo } = respuestaDeError(inconsistente(), REFERENCIA);

      expect(estado).toBe(500);
      expect(cuerpo.error.codigo).toBe("error_interno");
    });

    it("is logged as unexpected, because it means data is broken", () => {
      expect(respuestaDeError(inconsistente(), REFERENCIA).esInesperado).toBe(
        true,
      );
    });

    it("does not describe the broken invariant to the client", () => {
      const { cuerpo } = respuestaDeError(inconsistente(), REFERENCIA);

      expect(cuerpo.error.mensaje).not.toContain("inconsistente");
      expect(cuerpo.error.mensaje).not.toContain("1111-2222");
      expect(cuerpo.error.referencia).toBe(REFERENCIA);
    });

    // Same subclass trap as `ConflictoDeEstado`, in the other direction: it
    // extends `DomainError`, so a base-class branch reached first would answer
    // 400 with the invariant text in the body.
    it("is not swallowed by the generic domain-error branch", () => {
      expect(respuestaDeError(inconsistente(), REFERENCIA).estado).not.toBe(400);
    });
  });

  describe("framework errors", () => {
    it("passes an HttpException through with its own status", () => {
      expect(
        respuestaDeError(new NotFoundException("No existe."), REFERENCIA).estado,
      ).toBe(404);
      expect(
        respuestaDeError(new ForbiddenException("No."), REFERENCIA).estado,
      ).toBe(403);
    });

    // A client has to branch on these: 401 means "send them back to the login
    // screen", 403 means "hide the button", 429 means "wait and retry". Making
    // that readable from a code rather than from a status number keeps the
    // React side from re-deriving it.
    it("gives the statuses a client acts on their own codes", () => {
      expect(
        respuestaDeError(new UnauthorizedException("x"), REFERENCIA).cuerpo.error
          .codigo,
      ).toBe("no_autenticado");
      expect(
        respuestaDeError(new ForbiddenException("x"), REFERENCIA).cuerpo.error
          .codigo,
      ).toBe("sin_permiso");
      expect(
        respuestaDeError(new NotFoundException("x"), REFERENCIA).cuerpo.error
          .codigo,
      ).toBe("no_encontrado");
      expect(
        respuestaDeError(
          new HttpException("x", HttpStatus.TOO_MANY_REQUESTS),
          REFERENCIA,
        ).cuerpo.error.codigo,
      ).toBe("demasiadas_peticiones");
    });

    // The throttler's own message is "ThrottlerException: Too Many Requests".
    // A technician reads this.
    it("answers a throttled request in Spanish, not in the library's English", () => {
      const { cuerpo } = respuestaDeError(
        new HttpException(
          "ThrottlerException: Too Many Requests",
          HttpStatus.TOO_MANY_REQUESTS,
        ),
        REFERENCIA,
      );

      expect(cuerpo.error.mensaje).not.toMatch(/Throttler|Too Many/);
      expect(cuerpo.error.mensaje).toMatch(/intentos|espere|minuto/i);
    });

    it("keeps a body the validation pipe already shaped", () => {
      const delPipe = new BadRequestException({
        error: {
          mensaje: "Revise los datos cargados.",
          codigo: "validacion",
          campos: { dni: "El DNI tiene que tener 7 u 8 dígitos." },
        },
      });

      const { estado, cuerpo } = respuestaDeError(delPipe, REFERENCIA);

      expect(estado).toBe(400);
      expect(cuerpo.error.codigo).toBe("validacion");
      expect(cuerpo.error.campos).toEqual({
        dni: "El DNI tiene que tener 7 u 8 dígitos.",
      });
    });
  });

  describe("unexpected errors", () => {
    it("answers 500 with a generic message and a correlation id", () => {
      const { estado, cuerpo } = respuestaDeError(
        new Error("connect ECONNREFUSED 10.0.0.4:5432"),
        REFERENCIA,
      );

      expect(estado).toBe(500);
      expect(cuerpo.error.codigo).toBe("error_interno");
      expect(cuerpo.error.referencia).toBe(REFERENCIA);
    });

    // Whatever blew up, the reply must not describe the inside of the server.
    it("never leaks the original message, stack or connection string", () => {
      const original = new Error(
        "connect ECONNREFUSED postgresql://contratos:clave@10.0.0.4:5432/contratos",
      );

      const { cuerpo } = respuestaDeError(original, REFERENCIA);
      const serializado = JSON.stringify(cuerpo);

      expect(serializado).not.toContain("ECONNREFUSED");
      expect(serializado).not.toContain("clave");
      expect(serializado).not.toContain("10.0.0.4");
      expect(serializado).not.toContain("stack");
    });

    it("handles a thrown non-Error without falling over", () => {
      expect(respuestaDeError("un string suelto", REFERENCIA).estado).toBe(500);
      expect(respuestaDeError(null, REFERENCIA).estado).toBe(500);
    });

    it("tells the caller to quote the reference, so a log lookup is possible", () => {
      const { cuerpo } = respuestaDeError(new Error("x"), REFERENCIA);

      expect(cuerpo.error.mensaje).toContain(REFERENCIA);
    });
  });

  describe("personal data", () => {
    // Ley 25.326 (DESIGN.md §10). The domain deliberately keeps DNI, phone
    // numbers and GPS out of its messages; this layer must not add them back.
    it("attaches no personal data of its own to any response", () => {
      const respuestas = [
        respuestaDeError(new CredencialesInvalidas(), REFERENCIA),
        respuestaDeError(new DomainError("El campo ciudad es obligatorio."), REFERENCIA),
        respuestaDeError(new Error("boom"), REFERENCIA),
      ];

      for (const { cuerpo } of respuestas) {
        expect(Object.keys(cuerpo)).toEqual(["error"]);
        expect(Object.keys(cuerpo.error).sort()).toEqual(
          expect.arrayContaining(["codigo", "mensaje"]),
        );
      }
    });
  });
});
