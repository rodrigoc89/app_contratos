import { createHash, randomBytes } from "node:crypto";

import type {
  GeneradorDeTokenDeRefresco,
  TokenDeRefrescoGenerado,
} from "../application/ports/puertos";

/** 256 bits. Below this, "unguessable" stops being an argument. */
const BYTES_DE_TOKEN = 32;

/**
 * Mints refresh tokens and computes the digest that gets stored for them.
 *
 * **Why SHA-256 and not argon2.** Password digests are slow on purpose because
 * a password is low-entropy and guessable. This token is 32 bytes straight
 * from the CSPRNG, so there is no dictionary to run against it and nothing for
 * a slow hash to defend. What matters instead is that the refresh endpoint
 * looks a token up by exact digest on an indexed column, which an argon2
 * digest — salted, therefore different every time — simply cannot do.
 *
 * **What it buys.** Only the digest is written down. A stolen database dump
 * does not yield a working session on any tablet, and revoking one lost device
 * is a row update rather than a rotation of the JWT secret that would sign out
 * every technician at once.
 */
export class GeneradorDeTokenDeRefrescoCrypto
  implements GeneradorDeTokenDeRefresco
{
  generar(): TokenDeRefrescoGenerado {
    // base64url: it travels in a JSON body and, eventually, in a header.
    const valor = randomBytes(BYTES_DE_TOKEN).toString("base64url");

    return { valor, hash: this.hashDe(valor) };
  }

  hashDe(valor: string): string {
    return createHash("sha256").update(valor, "utf8").digest("hex");
  }
}
