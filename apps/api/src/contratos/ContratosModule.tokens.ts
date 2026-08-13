/**
 * Injection tokens for the contract module's ports and use cases.
 *
 * Their own file because `ContratosController` and `ContratosModule` both need
 * them, and importing the module from the controller it declares would be a
 * cycle — the same arrangement `IdentidadModule.tokens.ts` uses.
 *
 * Every one of them is explicit on purpose. `src/main.ts` explains why: the
 * runtime (jiti) emits decorator metadata and the test transpiler (esbuild)
 * does not, so DI-by-type would behave differently in tests than in
 * production. Ports are interfaces with no runtime value and would need
 * tokens regardless; making it universal is what keeps the two identical.
 */

// ---- ports ----------------------------------------------------------------

export const CONTRATO_REPOSITORY = Symbol("CONTRATO_REPOSITORY");
export const PLANTILLA_REPOSITORY = Symbol("PLANTILLA_REPOSITORY");
export const FIRMANTE_REPOSITORY = Symbol("FIRMANTE_REPOSITORY");
export const GENERADOR_DE_DOCUMENTOS = Symbol("GENERADOR_DE_DOCUMENTOS");
export const ALMACEN_DE_DOCUMENTOS = Symbol("ALMACEN_DE_DOCUMENTOS");
export const RELOJ_CONTRATOS = Symbol("RELOJ_CONTRATOS");
export const IDENTIFICADOR_DE_CONTRATO = Symbol("IDENTIFICADOR_DE_CONTRATO");

// ---- use cases ------------------------------------------------------------

export const CREAR_BORRADOR = Symbol("CREAR_BORRADOR");
export const ACTUALIZAR_BORRADOR = Symbol("ACTUALIZAR_BORRADOR");
export const PREVISUALIZAR_CONTRATO = Symbol("PREVISUALIZAR_CONTRATO");
export const FIRMAR_CONTRATO = Symbol("FIRMAR_CONTRATO");
export const CONSULTAR_CONTRATO = Symbol("CONSULTAR_CONTRATO");
export const DESCARGAR_DOCUMENTO = Symbol("DESCARGAR_DOCUMENTO");
export const BUSCAR_CONTRATOS = Symbol("BUSCAR_CONTRATOS");
