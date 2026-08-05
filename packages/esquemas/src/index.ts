/**
 * Validation schemas shared by the contracts API and the React PWA.
 *
 * DESIGN.md §5.1 states why this package exists, and it is worth restating
 * here because it is the only reason to pay the cost of a shared package:
 *
 * > A contract rejected by the server after the customer already signed is
 * > the worst possible failure in this system, so client and server must
 * > agree by construction, not by discipline.
 *
 * So DNI format, MAC format, the WhatsApp number, the required fields and the
 * equipment fields are defined **once**, here. React Hook Form validates
 * against these schemas on the tablet; `ZodValidationPipe` validates against
 * the very same objects on the server.
 *
 * **The domain remains the authority.** Where a schema mirrors a value object
 * (`Dni`, `DireccionMac`, `MetrosCano`, `NumeroWhatsapp`), this package is a
 * fast client-side pre-check, not a second source of truth — see the header
 * of `normalizacion.ts`, and the test in `apps/api` that pins the two
 * together.
 *
 * **This package must stay browser-safe.** No Node built-ins, no server-only
 * imports, ESM only. `tsconfig.json` enforces it with an empty `types` and a
 * DOM-free `lib`, so a violation fails `pnpm typecheck` here rather than at
 * Vite build time.
 */

export * from "./auth";
export * from "./campos";
export * from "./contrato";
export * from "./firma";
export * from "./normalizacion";
export * from "./respuestas";
