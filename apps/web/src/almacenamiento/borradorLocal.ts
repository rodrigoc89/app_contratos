import { EsquemaCrearContrato, type DatosCrearContrato } from "@contratos/esquemas";

/**
 * DESIGN.md D8 — local recovery of an in-progress `borrador`. One
 * technician, one visit at a time, so a single fixed key is enough.
 */
const CLAVE_BORRADOR = "contratos.borrador.v1";

/**
 * Bumped whenever `DatosBorradorLocal`'s shape changes. A stale version is
 * discarded on read rather than trusted or migrated — safer than guessing
 * at a shape that has since changed.
 */
const VERSION_ACTUAL = 1;

/**
 * 12 hours. A visit does not span a day; a draft resurfacing on a shared
 * tablet after this long is worse than the technician retyping it — and
 * it is one less window in which a customer's name, DNI and address sit
 * on a device that leaves the building (Ley 25.326).
 */
const VIGENCIA_MS = 12 * 60 * 60 * 1000;

export type PasoBorrador = "comodatario" | "equipos";

/**
 * `valores` is typed as `DatosCrearContrato` — `{ comodatario; equipos }`,
 * imported from `@contratos/esquemas` — which has no `firmas` field. There
 * is structurally no parameter through which a signature could ever reach
 * `guardarBorradorLocal`: the settled recovery decision (form data is
 * recovered after an app kill, signatures are not, the technician
 * re-captures them) is enforced by the type, not by a rule an implementer
 * has to remember. See `borradorLocal.spec.ts` for the runtime proof that
 * survives even a future call site bypassing this type.
 */
export interface DatosBorradorLocal {
  readonly version: typeof VERSION_ACTUAL;
  readonly guardadoEn: number;
  readonly contratoId: string | null;
  readonly paso: PasoBorrador;
  readonly valores: DatosCrearContrato;
}

type DatosBorradorAGuardar = Omit<DatosBorradorLocal, "version" | "guardadoEn">;

/**
 * Debounced by the caller on form change (DESIGN.md D8, "Written when").
 * Always overwrites the single stored draft — there is only ever one
 * technician on one visit using this tablet at a time.
 */
export function guardarBorradorLocal(datos: DatosBorradorAGuardar): void {
  const registro: DatosBorradorLocal = {
    version: VERSION_ACTUAL,
    guardadoEn: Date.now(),
    ...datos,
  };
  localStorage.setItem(CLAVE_BORRADOR, JSON.stringify(registro));
}

function esRegistroPlausible(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null;
}

/**
 * Returns the saved draft, or `null` if there is none, it does not parse,
 * its version does not match, or it is older than the 12h window — in
 * every one of those cases the stale/unusable entry is also removed
 * (DESIGN.md D8, "Version mismatch discards silently").
 *
 * `valores` is re-parsed through `EsquemaCrearContrato` here, not merely
 * trusted from storage. Zod strips unknown keys by default (the same
 * behaviour `EsquemaComodatario`/`EsquemaEquipos` already rely on), so
 * even a payload written directly to `localStorage` with an extra field
 * — e.g. a future bug that widens what gets saved — comes back out
 * without it. This is the second, independent layer behind the
 * compile-time guarantee on `guardarBorradorLocal`'s parameter type.
 */
export function leerBorradorLocal(): DatosBorradorLocal | null {
  const crudo = localStorage.getItem(CLAVE_BORRADOR);
  if (crudo === null) {
    return null;
  }

  let candidato: unknown;
  try {
    candidato = JSON.parse(crudo);
  } catch {
    limpiarBorradorLocal();
    return null;
  }

  if (!esRegistroPlausible(candidato) || candidato["version"] !== VERSION_ACTUAL) {
    limpiarBorradorLocal();
    return null;
  }

  const analisisValores = EsquemaCrearContrato.safeParse(candidato["valores"]);
  const guardadoEn = candidato["guardadoEn"];
  const contratoId = candidato["contratoId"];
  const paso = candidato["paso"];

  if (
    !analisisValores.success ||
    typeof guardadoEn !== "number" ||
    !(contratoId === null || typeof contratoId === "string") ||
    (paso !== "comodatario" && paso !== "equipos")
  ) {
    limpiarBorradorLocal();
    return null;
  }

  const vencido = Date.now() - guardadoEn > VIGENCIA_MS;
  if (vencido) {
    limpiarBorradorLocal();
    return null;
  }

  return {
    version: VERSION_ACTUAL,
    guardadoEn,
    contratoId,
    paso,
    valores: analisisValores.data,
  };
}

/**
 * Clears the stored draft unconditionally. The intended call sites — none
 * wired yet, each pending the flow that makes it reachable — are signing
 * success (PR14), the technician tapping "descartar" (no such control is
 * designed yet), logout (`cerrarSesion`, D4), and a fetched contract that
 * is no longer `estado: "borrador"` (no single-contract `GET` exists yet).
 * `limpiarBorradorLocal` is exported now so each of those callers has a
 * single, already-tested function to call once its flow exists.
 */
export function limpiarBorradorLocal(): void {
  localStorage.removeItem(CLAVE_BORRADOR);
}
