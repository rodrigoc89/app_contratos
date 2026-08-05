import { hash, hashSync, verify } from "@node-rs/argon2";

import type { HashDeContrasena } from "../application/ports/puertos";

/**
 * Password hashing with argon2id.
 *
 * argon2id rather than bcrypt because it is memory-hard: the cost of a
 * brute-force attempt is RAM, not just cycles, which is what takes cheap GPU
 * parallelism off the table.
 *
 * The parameters below are OWASP's current baseline (19 MiB, 2 iterations,
 * 1 lane). They are stated explicitly rather than left to the library's
 * defaults so that raising them later is a visible, reviewable change — and so
 * that a future library upgrade cannot silently lower them.
 *
 * The digest carries its own parameters, so raising them does not invalidate
 * existing users: old digests keep verifying against the settings they were
 * created with.
 */
const MEMORIA_KIB = 19_456;
const ITERACIONES = 2;
const PARALELISMO = 1;

/**
 * `Algorithm.Argon2id` from `@node-rs/argon2` is an ambient `const enum`, which
 * `verbatimModuleSyntax` (see tsconfig.json) refuses to import — there is no
 * runtime object to import, only a compile-time substitution this project does
 * not perform. The numeric value is inlined instead, and pinned by
 * `HashDeContrasenaArgon2.spec.ts`, which asserts the digest starts with
 * `$argon2id$`. A library change that renumbered the enum would fail that test
 * rather than silently downgrade every password to argon2i.
 */
const ARGON2ID = 2;

const OPCIONES = {
  algorithm: ARGON2ID,
  memoryCost: MEMORIA_KIB,
  timeCost: ITERACIONES,
  parallelism: PARALELISMO,
} as const;

/**
 * A digest of a password nobody has.
 *
 * Computed once at module load against random bytes, so it is a genuine
 * argon2id digest with the same cost as a real one. `IniciarSesion` verifies
 * against it when the username does not exist, so the endpoint spends the same
 * time on a miss as on a hit — a same-message login that answers instantly for
 * unknown users has not actually hidden which users exist.
 */
const SENUELO = hashSync(
  "señuelo-sin-usuario-no-verifica-contra-nada",
  OPCIONES,
);

export class HashDeContrasenaArgon2 implements HashDeContrasena {
  async hashear(contrasena: string): Promise<string> {
    return await hash(contrasena, OPCIONES);
  }

  async verificar(digest: string, contrasena: string): Promise<boolean> {
    try {
      return await verify(digest, contrasena, OPCIONES);
    } catch {
      // A malformed digest is `false`, never an exception. The decoy path
      // above depends on it, and a corrupt row in `usuarios` must fail that
      // one login rather than turn into a 500 that distinguishes it.
      return false;
    }
  }

  /**
   * The decoy's own password is hardcoded and public on purpose. It exists
   * only to burn CPU on the miss path and is never compared against anything a
   * user typed successfully, so keeping it secret would buy nothing — and a
   * random value would have to be stored somewhere, which is strictly worse.
   */
  hashSenuelo(): string {
    return SENUELO;
  }
}
