# Comodante signature

## `comodante-v1.png` — the real signature, active

The handwritten signature of Sieira Guillermo Federico, handed over as a 300 dpi
A4 scan in August 2026 and extracted from it: black ink on transparency, 1200 x
343, cropped to the stroke and padded to the 3.5:1 box the template draws it in
(`.firma-imagen` in `v1-comodato.html` is `height: 20mm; max-width: 70mm;
object-fit: contain`).

Alpha comes from ink darkness rather than a 1-bit threshold, so the pen's
antialiasing survives; a signature rebuilt from a hard mask looks like a
tracing. Where the pen ran light the stroke breaks into fragments as small as a
speck of scanner noise, so **size alone cannot separate signature from noise** —
one genuine fragment measured 28 px. Anything inside the stroke's own bounding
box is ink and is kept.

This is a private individual's handwriting. It lives in this repository only
because the repository is private, and it must never reach the web bundle or
any publicly readable storage: it is read server-side, while rendering the PDF.
`FirmanteComodante.toJSON` refuses to serialise the image so that no future
controller can leak it by forgetting to strip a field.

## `comodante-v0-prueba.png` — placeholder, for local development

This is **not** a signature. It is a generated image that reads, in legible red
capitals inside a heavy frame:

```
FIRMA DE PRUEBA
NO VALIDA
```

It predates the real signature, and it is kept now that the real one has landed
so that local development and demos can seed a database without stamping real
handwriting onto throwaway contracts. A contract signed with it is rendered,
hashed, sealed and stored exactly like a real one — nothing downstream can tell
them apart. The only thing that can is a human looking at the printed page, so
the image is built to be impossible to mistake, not to look plausible.

Using it means pointing `SIGNATORY_VERSION` back at
`PROVISIONAL_SIGNATORY_VERSION` in `src/seed/seedContent.ts`. `seedDatabase`
refuses to install that signatory when `NODE_ENV=production`.

## Finding contracts signed with the placeholder

Every contract stores the signatory version it was signed against, and seeding
a new version adds a row rather than overwriting the old one. So the contracts
signed before the real signature landed are still identifiable, permanently, by
a single query:

```sql
SELECT c.numero
FROM contratos c
JOIN firmantes_comodante f ON f.id = c.firmante_id
WHERE f.version = 'v0-prueba';
```

Those contracts are not made valid by this file existing. They were signed
against the placeholder and they still carry it.

## Reproducing the placeholder bytes

The placeholder is generated, not drawn, and the bytes are deterministic: the
bitmap comes from a table in `src/seed/placeholderSignaturePng.ts`, and the
image data is written as *uncompressed* deflate blocks so the output does not
depend on the zlib build of whoever regenerates it.

```sh
pnpm --filter @contratos/api prisma:firma-de-prueba
```

Re-running that must leave the working tree clean. `seedContent.spec.ts`
asserts the committed file still equals what the generator produces, so a
hand-edited PNG fails the suite.

## Publishing a new signature version

1. Drop the new image in this directory as `comodante-vN.png` — a PNG on a
   transparent or white background, at least 600 px wide, and close to 3.5:1 so
   it fills the template's box instead of being letterboxed inside it. Crop to
   the stroke; pad symmetrically to reach the ratio, never stretch.
2. In `src/seed/seedContent.ts`, point `COMODANTE_SIGNATURE_PNG_PATH` at it and
   change `SIGNATORY_VERSION` and `SIGNATORY_ID` to `vN` /
   `firmante-comodante-vN`. Leave `PROVISIONAL_SIGNATORY_VERSION` alone: it is
   what the production guard and the query above key on.
3. Re-run the seed. The previous signatory row stays where it is — that is what
   keeps every already-signed contract pointing at the signature it was
   actually signed with.
4. Render a contract and **look at it**. The test suite proves the PNG decodes
   and fits the box; only a human eye proves it looks like the signature.
