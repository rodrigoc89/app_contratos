import type { DatosSesion } from "@contratos/esquemas";

/**
 * DESIGN.md D9 — one place answers "where does this role live". No exported
 * `Rol` type exists in `@contratos/esquemas` (only the inline session
 * schema's enum), so it is derived from the wire type rather than
 * re-declared — the same pattern `rutas.spec.tsx`/`PaginaLogin.spec.tsx`
 * already use for their own fake-session builders.
 */
export type Rol = DatosSesion["usuario"]["rol"];

/**
 * `Record<Rol, string>` makes adding a role a compile error (exhaustiveness):
 * every role in the union MUST have an entry here or the object literal
 * fails to type-check.
 */
const INICIO_POR_ROL: Record<Rol, string> = {
  tecnico: "/",
  oficina: "/contratos",
  admin: "/contratos",
};

/**
 * Pure: no React, no router, no session store. `rol` is typed `string` (not
 * `Rol`) because it is what a live session — or a route param — hands back,
 * which TypeScript cannot narrow to the closed union on its own. The `??`
 * fallback is what makes an unrecognized role testable at all: without it,
 * an unknown role would only ever be reachable by lying to the type system.
 */
export function rutaInicialPara(rol: string): string {
  return INICIO_POR_ROL[rol as Rol] ?? "/panel-no-disponible";
}
