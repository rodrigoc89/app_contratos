import { EsquemaSesion } from "@contratos/esquemas";
import { describe, expect, it } from "vitest";

import { ROLES_USUARIO } from "../../domain/Usuario";

/**
 * The pinning test that stops the inlined `ROLES_USUARIO` in
 * `@contratos/esquemas` from drifting away from the domain's own tuple.
 *
 * Same shape as `../../../contratos/interface/dto/esquemasContraDominio.spec.ts`
 * (compare a schema against the domain it restates), applied to a single
 * closed-set field instead of a sweep of formats.
 *
 * `packages/esquemas/src/auth.ts` cannot `import` `ROLES_USUARIO` from
 * `apps/api/src/identidad/domain/Usuario.ts` — `paqueteNavegable.spec.ts`
 * only allows `"zod"` and relative specifiers in that package, so the
 * package stays consumable by a browser bundle. It inlines the tuple
 * instead. Inlining means two copies of the same three strings, and two
 * copies can only stay honest with a test that fails the moment they
 * disagree — a schema slightly *looser* than the domain here would let a
 * technician's tablet accept a session with a role the server does not
 * recognise, and a schema *stricter* than the domain would reject a real
 * account's session on the client for no server-side reason.
 */
describe("the roles inlined in @contratos/esquemas never drift from the domain", () => {
  const esquemaDeRol = EsquemaSesion.shape.usuario.shape.rol;

  it("lists exactly the same roles, in the same order, as Usuario.ts's ROLES_USUARIO", () => {
    expect(esquemaDeRol.options).toEqual(ROLES_USUARIO);
  });

  it.each(ROLES_USUARIO)("accepts the domain role %s", (rol) => {
    expect(esquemaDeRol.safeParse(rol).success).toBe(true);
  });

  it.each(["administrador", "TECNICO", "Tecnico", "", " ", "tecnico "])(
    "rejects %j, which is not one of the domain's roles",
    (candidato) => {
      expect(esquemaDeRol.safeParse(candidato).success).toBe(false);
    },
  );
});
