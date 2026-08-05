# Comodante signature

## `comodante-v0-prueba.png` — placeholder, not a signature

This is **not** the signature of Sieira Guillermo Federico. It is a generated
image that reads, in legible red capitals inside a heavy frame:

```
FIRMA DE PRUEBA
NO VALIDA
```

It exists because the real signature has not been handed over yet, and because
a contract signed with a placeholder is rendered, hashed, sealed and stored
exactly like a real one — nothing downstream can tell them apart. The only
thing that can is a human looking at the printed page, so the image is built to
be impossible to mistake, not to look plausible.

Everything seeded with it is tagged with the signatory version `v0-prueba`, and
every contract stores the signatory version it was signed against. That makes
"which contracts carry the fake signature?" a single query:

```sql
SELECT c.numero
FROM contratos c
JOIN firmantes_comodante f ON f.id = c.firmante_id
WHERE f.version = 'v0-prueba';
```

`seedDatabase` refuses to install this signatory when `NODE_ENV=production`.

## Reproducing the bytes

The file is generated, not drawn, and the bytes are deterministic: the bitmap
comes from a table in `src/seed/placeholderSignaturePng.ts`, and the image data
is written as *uncompressed* deflate blocks so the output does not depend on
the zlib build of whoever regenerates it.

```sh
pnpm --filter @contratos/api prisma:firma-de-prueba
```

Re-running that must leave the working tree clean. `seedContent.spec.ts`
asserts the committed file still equals what the generator produces, so a
hand-edited PNG fails the suite.

## Swapping in the real signature

1. Drop the real image in this directory as `comodante-v1.png` — a PNG with a
   transparent or white background, roughly 3:1, at least 600 px wide.
2. In `src/seed/seedContent.ts`, point `COMODANTE_SIGNATURE_PNG_PATH` at it and
   change `SIGNATORY_VERSION` and `SIGNATORY_ID` to `v1` /
   `firmante-comodante-v1`. Leave `PROVISIONAL_SIGNATORY_VERSION` alone: it is
   what the production guard and the query above key on.
3. Delete this placeholder file and the generator, or keep them for local
   development — but never let `v0-prueba` become the active signatory on a
   production database.

The real image is a private individual's handwritten signature. It must not
reach the public frontend bundle or any publicly readable storage; it is read
server-side only, while rendering the PDF (`FirmanteComodante.toJSON` refuses
to serialise it for exactly this reason).
