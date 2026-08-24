/**
 * design.md D2 — the disposition register, closing the hole a scanner that
 * retires can leave: a protection that LEFT one scanner and never ARRIVED
 * in another.
 *
 * PR3 seeded state: all 21 entries were `CSS`, read by the now-deleted
 * `convencionesDeEstilos.spec.ts` — nothing had converted yet. PR19 (task
 * 19.1-19.3) closes the migration: zero entries remain `CSS`, and
 * `convencionesDeEstilos.spec.ts` itself is deleted (task 19.2). Every
 * entry is now `JSX`/`AMBOS`/`MOOT`, owned by `convencionesDeUtilidades.spec.ts`
 * and/or `convencionesDeCompilado.compilado.spec.ts`.
 */

export type Disposicion = "CSS" | "JSX" | "AMBOS" | "MOOT" | "RESUELTA";

const DISPOSICIONES_VALIDAS: ReadonlySet<Disposicion> = new Set<Disposicion>([
  "CSS",
  "JSX",
  "AMBOS",
  "MOOT",
  "RESUELTA",
]);

/**
 * One `it(...)`/`it.each(...)` title this entry's protection must still
 * appear under (recorded verbatim, `${…}` syntax included, for a literal
 * substring search), and the owning spec file, relative to `apps/web/src`.
 */
export interface PruebaDeGuardia {
  readonly archivo: string;
  readonly titulo: string;
}

export interface EntradaDeRegistro {
  readonly numero: number;
  readonly protege: string;
  readonly disposicion: Disposicion;
  /** Required for `CSS`/`AMBOS` — a `src/estilos/*.css` file the protection still reads. */
  readonly archivoCss?: string;
  /** Required for `CSS`/`JSX`/`AMBOS` — at least one owning test (`styling-guards` req. 2). */
  readonly pruebas?: readonly PruebaDeGuardia[];
  /** Required for `MOOT`/`RESUELTA` — why no scanner protects this entry. */
  readonly porque?: string;
}

const UTILIDADES = "estilos/convencionesDeUtilidades.spec.ts";
const COMPILADO = "estilos/convencionesDeCompilado.compilado.spec.ts";

export const REGISTRO: readonly EntradaDeRegistro[] = [
  {
    // PR6 (design.md slice B) — the collision cluster. CSS half stayed
    // live through PR18 alongside the compiled+JSX halves; PR19 (task
    // 19.2/19.3) deletes base.css, so the final disposition drops its
    // archivoCss and ESTILOS-owned test — the compiled half (guard 1/16
    // shared) scans real dist/ output, where Tailwind Preflight and any
    // vendored .sr-only usage are visible; the JSX half bans the literal
    // `sr-only` token at author time, independent of whether a build has
    // run. Both survive the deletion untouched, so AMBOS is this guard's
    // permanent final disposition, not a transitional one.
    numero: 1,
    protege: "No overflow:hidden/clip anywhere (reading gate) + sr-only token ban",
    disposicion: "AMBOS",
    pruebas: [
      { archivo: COMPILADO, titulo: "finds no overflow:hidden|clip or clip-path rule in the real compiled dist/ output" },
      {
        archivo: UTILIDADES,
        titulo: "rejects every real .tsx file under apps/web/src that contains the literal sr-only token",
      },
    ],
  },
  {
    // PR6 — the project's own `[hidden]` duplicate was deleted from
    // base.css (design.md slice B); Tailwind Preflight's equivalent rule
    // is now the sole `!important display` rule, visible only in compiled
    // output. PR14 (final confirmation) — `EscanerDeMac.tsx`'s camera-preview
    // `<video>` redesigns off the retired `.escaner-de-mac__video` BEM
    // class; a rendered component test confirms the converted element is
    // hidden by the `[hidden]` attribute and never by the `hidden` class,
    // whose plain `display: none` a later `cn()` merge could reorder away.
    // `block` beside the attribute is fine — Preflight's rule is `!important`.
    // PR19 (task 19.2/19.3) — base.css itself is deleted; the negative it
    // used to prove ("no project-authored [hidden] rule survives") is now
    // structurally true (there is no hand-authored sheet left to declare
    // one in), so the ESTILOS-owned test and archivoCss both drop. The
    // compiled test still proves Preflight's rule is the sole owner.
    numero: 2,
    protege: "Exactly one !important display declaration ([hidden])",
    disposicion: "AMBOS",
    pruebas: [
      {
        archivo: COMPILADO,
        titulo: "finds exactly one !important display rule in the real compiled dist/ output — Preflight's own [hidden] rule",
      },
      {
        archivo: UTILIDADES,
        titulo:
          "EscanerDeMac's real camera-preview <video> carries the hidden ATTRIBUTE and never the hidden class",
      },
    ],
  },
  {
    // PR7 — Boton redesigned; the CSS-scoped min-height/min-width scan
    // retires along with `.boton`, replaced by the ported heuristic reading
    // the cva `tamano` variant map (D5 early, generalised into
    // pisoDeToque.ts in PR9).
    numero: 3,
    protege: ".boton ≥48px touch floor",
    disposicion: "JSX",
    pruebas: [
      {
        archivo: UTILIDADES,
        titulo: "resolves every variante x tamano Boton declares to >=48px on both axes",
      },
    ],
  },
  {
    // PR7 — variant half: Boton's destructivo cva variant proves the
    // colour-not-position half plus a fixture composition's >=32px gap.
    // PR13 (task 13.2/13.6) — final confirmation: LienzoDeFirma's real composition proves both hold there too.
    // PR17b (task 17b.3) — second real-composition confirmation:
    // AccionesDeContrato's Anular/Dar de baja pair, the office's own
    // destructive control. No mb-N assertion here (unlike LienzoDeFirma's
    // Firmar) — the confirmation form the row opens into never co-exists
    // with it in the DOM, so there is no simultaneous next control to clear.
    numero: 4,
    protege: "32px gap + destructive colour-not-position (signature + office actions)",
    disposicion: "JSX",
    pruebas: [
      {
        archivo: UTILIDADES,
        titulo: "colours the destructivo variant by its own prop, regardless of where it sits in the composition",
      },
      {
        archivo: UTILIDADES,
        titulo: "keeps at least ${SEPARACION_MINIMA_PX}px of gap in a fixture composition of adjacent Boton controls",
      },
      {
        archivo: UTILIDADES,
        titulo: "colours Borrar as destructive by its own variant in LienzoDeFirma's real composition, never by position",
      },
      {
        archivo: UTILIDADES,
        titulo:
          "keeps at least ${SEPARACION_MINIMA_PX}px between Deshacer and Borrar, and below the row before Firmar, in LienzoDeFirma's real composition",
      },
      {
        archivo: UTILIDADES,
        titulo:
          "colours Anular as destructive by its own variant in AccionesDeContrato's real composition, never by position",
      },
      {
        archivo: UTILIDADES,
        titulo:
          "keeps at least ${SEPARACION_MINIMA_PX}px of gap between Dar de baja and Anular in AccionesDeContrato's real composition",
      },
    ],
  },
  {
    // PR15 (task 15.1) — TablaDeContratos redesigned; ownership moves fully
    // to the JSX scan, ported as a token ban over every real <tr>/<td>/<th>:
    // no >=48px sizing token, no cursor-pointer. The CSS-scoped test
    // (`convencionesDeEstilos.spec.ts`) now reads only the frozen BEM sheet
    // (`panel.css`, deleted PR16) and stays live but unowned here.
    numero: 5,
    protege: "48px floor explicitly absent on table rows",
    disposicion: "JSX",
    pruebas: [
      {
        archivo: UTILIDADES,
        titulo:
          "rejects every real <tr>/<td>/<th> in TablaDeContratos whose className carries a sizing token or cursor-pointer",
      },
    ],
  },
  {
    // PR7 (D6) — ownership moves fully to the ring-aware JSX judgment.
    // `convencionesDeEstilos.spec.ts`'s CSS-scoped scan still runs over the
    // still-BEM sheets (nothing there removes a focus indicator today), but
    // this protection's owner is now the scanner that recognises a
    // focus-visible:ring replacement, which the CSS-scoped version cannot.
    numero: 6,
    protege: "Focus-visible never silently removed without a declared replacement",
    disposicion: "JSX",
    pruebas: [
      {
        archivo: UTILIDADES,
        titulo: "rejects every real .tsx file under apps/web/src whose outline-none has no valid focus-visible replacement",
      },
    ],
  },
  {
    numero: 7,
    // task 3.9 — mechanism now lives in convencionesDeUtilidades.spec.ts's
    // breakpoint-prefix whitelist; the CSS-scoped min-width scan stays live
    // for the still-BEM stylesheets until PR19 deletes them. PR16 (task
    // 16.3, D4): the rebind/read-back half is RESUELTA, not merely MOOT —
    // `LayoutPanel` states its 16px base as a literal `text-[16px]` utility
    // on the same wrapper element instead of rebinding an inherited
    // `--fuente-base` custom property and reading it back, so the "rebind
    // alone is inert" bug class is now structurally impossible for this
    // shell, with a real mechanism behind it rather than a promise. The
    // PR19 (task 19.2/19.3) — `tokens.css`/`base.css` are deleted along with
    // the GLOBAL `--fuente-base` custom property their `body` rule rebound;
    // `tema.css`'s surviving `@layer base` rule states `--text-base` (18px)
    // directly on `body`, never rebound or read back elsewhere, so the
    // rebind-without-readback pattern this half protected against is now
    // structurally impossible everywhere, not only in `LayoutPanel`.
    // Disposition stays JSX — the breakpoint-prefix scan is still live.
    protege:
      "Exactly the 640/1024 breakpoints (tableta/escritorio prefixes); rebind/read-back half RESUELTA structurally in LayoutPanel (PR16)",
    disposicion: "JSX",
    pruebas: [
      {
        archivo: UTILIDADES,
        titulo: "rejects every real .tsx file under apps/web/src that uses a default breakpoint prefix",
      },
    ],
  },
  {
    // PR9 (task 9.5/9.7, D4) — axis moves from CSS filename (`panel.css`,
    // deleted PR19) to a component-path matcher: componentes/organismos/,
    // componentes/moleculas/, funcionalidades/contratos/. Deliberately
    // excludes componentes/atomos/ (the too-broad trap PR9's own comment
    // names) and, re-checked here, componentes/plantillas/ (task 16.4):
    // `LayoutPanel.tsx`'s literal `text-[16px]` utility (task 16.3) is
    // *not* actually sub-1rem — this project sets no `html { font-size }`
    // anywhere, so `rem` resolves against the browser's un-overridden 16px
    // root and 16px === 1rem exactly, which `MINIMO_REM_JSX = 1`'s strict
    // `<` comparison does not flag. PR16's gate found the scan blind to
    // `text-[Npx]` altogether (`text-[12px]` on `LayoutTecnico.tsx` stayed
    // green); it now converts px by the browser's 16px rem basis, and a
    // second test pins that basis by asserting no sheet sets font-size on
    // `html`. Falsified both ways: `text-sm` and `text-[12px]` on
    // `LayoutTecnico.tsx` fail naming the file; `LayoutPanel.tsx` needs no
    // axis entry because 16px is exactly 1rem, not because it is exempt.
    // PR17 (task 17.1b) — `PREFIJOS_RUTA_PANEL` exempts componentes/organismos/
    // wholesale, which blinds the tree-wide scan to the two técnico
    // organisms that live there. A dedicated component-level render scan
    // closes that hole, falsified genuinely (text-sm injected, both
    // organisms, reverted) since real converted markup carries no sub-1rem
    // attempt to catch naturally.
    numero: 8,
    protege: "No font-size<1rem outside the panel subtree",
    disposicion: "JSX",
    pruebas: [
      { archivo: UTILIDADES, titulo: "rejects every real .tsx file outside the panel subtree that attempts sub-1rem type" },
      { archivo: UTILIDADES, titulo: "keeps rem anchored to the browser default: no hand-authored sheet sets font-size on html" },
      { archivo: UTILIDADES, titulo: "finds zero sub-1rem attempts in FormularioComodatario's real rendered markup" },
      { archivo: UTILIDADES, titulo: "finds zero sub-1rem attempts in FormularioEquipos' real rendered markup" },
    ],
  },
  {
    // task 3.9 — mechanism ported to convencionesDeUtilidades.spec.ts,
    // reading @theme class names instead of CSS declarations; real-component
    // coverage (beyond the fixture proof) still lands in PR8.
    // PR8 (task 8.3/8.5) — real coverage lands: MarcaProducto's wordmark
    // exercises valorDeColor/matiz/saturacion/contraste together against
    // the real compiled tema.css, not only a fixture.
    // PR11 (task 11.4) — coverage extends to InsigniaDeEstado's four estado
    // tokens: the first real target outside the brand palette. matiz and
    // saturacion need no separate estado-specific test — both already have
    // real coverage via the wordmark, and none of the four estado colours
    // sits near the 190-230 brand-blue hue window their resolvers police.
    numero: 9,
    protege: "valorDeColor resolver, ported to @theme class names",
    disposicion: "JSX",
    pruebas: [
      { archivo: UTILIDADES, titulo: "resolves a bg-* utility class against the @theme block" },
      { archivo: UTILIDADES, titulo: "resolves the wordmark's brand span to >=4.5:1 against #ffffff" },
      {
        archivo: UTILIDADES,
        titulo: "resolves every estado's rendered bg-* utility to the exact hex value tema.css declares",
      },
    ],
  },
  {
    numero: 10,
    protege: "matiz (hue) resolver, ported to @theme class names",
    disposicion: "JSX",
    pruebas: [
      { archivo: UTILIDADES, titulo: "resolves hue in degrees, unchanged from the CSS-scoped version" },
      { archivo: UTILIDADES, titulo: "resolves the wordmark's brand span to >=4.5:1 against #ffffff" },
    ],
  },
  {
    numero: 11,
    protege: "saturacion resolver + 50% saturation floor, ported to @theme class names",
    disposicion: "JSX",
    pruebas: [
      { archivo: UTILIDADES, titulo: "resolves saturation as a percentage, unchanged from the CSS-scoped version" },
      { archivo: UTILIDADES, titulo: "resolves the wordmark's brand span to >=4.5:1 against #ffffff" },
    ],
  },
  {
    numero: 12,
    protege: "Guards A-D brand-blue contrast assertion, ported to JSX class names",
    disposicion: "JSX",
    pruebas: [
      {
        archivo: UTILIDADES,
        titulo: "fails a fixture Tailwind class resolving to raw #008bff on text, naming the selector and ratio",
      },
      { archivo: UTILIDADES, titulo: "resolves the wordmark's brand span to >=4.5:1 against #ffffff" },
      { archivo: UTILIDADES, titulo: "BarraDeBusqueda's rendered markup carries no marca-azul utility" },
      { archivo: UTILIDADES, titulo: "Paginador's rendered markup carries no marca-azul utility" },
    ],
  },
  {
    // PR10 (D6) — ownership moves to the JSX scan: BarraDeBusqueda/Paginador
    // no longer render `.boton--filtro-activo`/`.boton--pagina-actual`, so
    // the CSS-scoped test (`convencionesDeEstilos.spec.ts:1097-1195`) now
    // reads only the frozen BEM sheet (`panel.css`, deleted PR16) and stays
    // live but unowned here.
    numero: 13,
    protege: "Estado-chip 1.32:1 + pagination current-page contrast",
    disposicion: "JSX",
    pruebas: [
      {
        archivo: UTILIDADES,
        titulo: "rejects the historical estado-chip pair (#0b634a vs #094f3b, 1.32:1) that shipped once and was invisible",
      },
      {
        archivo: UTILIDADES,
        titulo: "separates BarraDeBusqueda's active estado chip from an inactive one by >=3:1, resolved from real rendered classes",
      },
      {
        archivo: UTILIDADES,
        titulo: "separates Paginador's current page from the other page buttons by >=3:1, resolved from real rendered classes",
      },
    ],
  },
  {
    // PR11 — ownership moves to the JSX scan: InsigniaDeEstado no longer
    // renders `.insignia-estado[data-estado=...]`, so the CSS-scoped test
    // (`convencionesDeEstilos.spec.ts:1210-1240`) now reads only the frozen
    // BEM sheet (`panel.css`, deleted PR16) and stays live but unowned here.
    numero: 14,
    protege: "4 distinct estado-badge colours + label always present",
    disposicion: "JSX",
    pruebas: [
      {
        archivo: UTILIDADES,
        titulo: "renders a [data-estado=...] hook whose background resolves to a real colour, for every estado",
      },
      {
        archivo: UTILIDADES,
        titulo: "paints the four estados in colours that are actually different from each other, resolved from real rendered classes",
      },
      {
        archivo: UTILIDADES,
        titulo: "keeps the Spanish label as the badge's entire accessible text, for every estado — colour is never the only channel",
      },
    ],
  },
  {
    // PR10 — ownership moves to the JSX scan for the same reason as guard
    // 13: `Paginador` no longer renders `.paginador`, so the CSS-scoped
    // test now reads only the frozen BEM sheet.
    numero: 15,
    protege: "Sticky paginator armed + opaque background",
    disposicion: "JSX",
    pruebas: [
      {
        archivo: UTILIDADES,
        titulo: "declares sticky with a bottom inset, since sticky alone silently does nothing",
      },
      {
        archivo: UTILIDADES,
        titulo: "gives the sticky paginator an opaque background so scrolled rows never show through it",
      },
    ],
  },
  {
    // PR6 — the displacement recipe (panel.css:254-256/303-305) is
    // unchanged: `left: -10000px`, never `overflow:hidden`/`clip-path`.
    // The compiled scan (shared with guard 1) confirms it survives the
    // Tailwind swap without a `.sr-only`/clip-path regression reappearing.
    // PR15 (task 15.3, final confirmation) — TablaDeContratos redesigned;
    // the recipe is ported to utilities (`-left-[10000px] h-px w-px`,
    // restored `table-header-group` at tableta) and a dedicated rendered
    // test confirms no sr-only/overflow-hidden|clip token appears on the
    // converted component. PR19 (task 19.2/19.3) — panel.css itself is
    // deleted; the ESTILOS-owned test and archivoCss drop, the compiled +
    // JSX halves carry the protection alone from here.
    numero: 16,
    protege: "Narrow-layout thead displaced, not clipped",
    disposicion: "AMBOS",
    pruebas: [
      { archivo: COMPILADO, titulo: "finds no overflow:hidden|clip or clip-path rule in the real compiled dist/ output" },
      {
        archivo: UTILIDADES,
        titulo:
          "displaces the header off-screen with a 1px box below tableta, and restores it as a static table-header-group at tableta",
      },
    ],
  },
  {
    // PR12 (design.md slice F1, task 12.3) — ownership moves to the JSX
    // scan: VisorDeDocumento no longer renders `.visor-documento__iframe`,
    // so the CSS-scoped test (`convencionesDeEstilos.spec.ts`, "finds and
    // constrains .visor-documento__iframe in estilos/organismos.css") now
    // reads only the frozen BEM sheet (`organismos.css`, deleted PR16) and
    // stays live but unowned here. The rebuilt guard is stated over every
    // <iframe> in apps/web/src, not scoped to VisorDeDocumento by name —
    // guard 15's PR11 lesson applied here before it needed a correction.
    numero: 17,
    protege: "Document-viewer iframe bounded vh (legal reading gate)",
    disposicion: "JSX",
    pruebas: [
      {
        archivo: UTILIDADES,
        titulo: "rejects every real <iframe> under apps/web/src whose className is not bounded to an explicit vh fraction",
      },
    ],
  },
  {
    // PR19 (task 19.3) — confirmed globally MOOT, not merely deferred: no
    // `@apply`-based custom class exists anywhere in `apps/web/src` (the
    // whole-tree zero-BEM scan, retired this same PR once its own sheets
    // were the only thing keeping its anti-rot floor non-vacuous, already
    // proved zero hand-authored BEM classNames remain). A modifier can only
    // be "declared above the base it overrides" inside a hand-authored BEM
    // sheet; with all six deleted (task 19.2) there is no sheet left in
    // which that ordering mistake could occur, so the cascade footgun this
    // guard watched is now structurally impossible, not merely unobserved.
    numero: 18,
    protege: "BEM modifier never declared above the base it overrides",
    disposicion: "MOOT",
    porque:
      "no @apply-based custom class exists anywhere in apps/web/src — every hand-authored BEM sheet was deleted in PR19 (task 19.2), so there is no sheet left in which a modifier could be declared above its base",
  },
  {
    // PR13 (task 13.6) — JSX tree-wide scan, same shape as guard 17's. The
    // runtime half (elementFromPoint at S3) has no jsdom equivalent, not registered here.
    numero: 19,
    protege: "Signature canvas bounded, controls never covered",
    disposicion: "JSX",
    pruebas: [
      {
        archivo: UTILIDADES,
        titulo: "rejects every real <canvas> under apps/web/src whose className is not bounded to an explicit vh fraction",
      },
    ],
  },
  {
    // PR9 (task 9.1-9.4/9.7, D5) — `pisoDeToque.ts` lands, proven on
    // fixtures first; TablaDeContratos (primary target) converts in PR15,
    // site-wide confirm PR16.
    // PR15 (task 15.2) — primary-target confirmed: the row link meets the
    // floor, and both of `EXENCIONES`' real entries (`tbody tr`,
    // `desplazamiento`) now correspond to a real scanned candidate.
    // PR17 (task 17.1a) — the técnico organisms confirmed; native
    // radio/checkbox controls resolved against base.css's `@layer base`
    // rule (`esControlNativoDeToque`, D5) rather than flagged.
    // PR17b (task 17b.1) — the office organisms confirmed: DetalleDeContrato's
    // downloads and AccionesDeContrato's both states (actions row and the
    // confirmation form it opens into).
    numero: 20,
    protege: "Universal touch-floor scan over every interactive control",
    disposicion: "JSX",
    pruebas: [
      { archivo: UTILIDADES, titulo: "finds and clears CampoTexto's and Boton's (every variante x tamano) rendered controls" },
      {
        archivo: UTILIDADES,
        titulo: "clears every non-exempt interactive control, and every EXENCIONES entry corresponds to a real scanned candidate",
      },
      {
        archivo: UTILIDADES,
        titulo:
          "anchors esControlNativoDeToque: a hand-authored sheet still sizes native radio/checkbox controls to the touch token",
      },
      {
        archivo: UTILIDADES,
        titulo:
          "clears AccionesDeContrato's real rendered controls, both the actions row and its confirmation form",
      },
    ],
  },
  {
    // PR8 (task 8.1/8.5) — JSX mechanism now exists (guard 21's ported
    // scan). The still-unconverted TablaDeContratos/PaginaDetalleContrato
    // links stay covered by the still-live CSS-scoped scan (D2) until
    // PR11/PR15 convert them — the same partial-coverage shape guard 4's
    // variant half took in PR7.
    numero: 21,
    protege: "Every <a>/<Link> gets a real box",
    disposicion: "JSX",
    pruebas: [
      {
        archivo: UTILIDADES,
        titulo: "rejects every real .tsx file under apps/web/src whose <a>/<Link> attempts a vertical utility without a box",
      },
    ],
  },
];

/** `styling-guards` scenario "the register is complete". */
export function erroresDeCompletitud(registro: readonly EntradaDeRegistro[]): string[] {
  const errores: string[] = [];

  if (registro.length !== 21) {
    errores.push(`the register has ${registro.length} entries, expected exactly 21`);
  }

  const vistos = new Set<number>();
  for (const entrada of registro) {
    if (vistos.has(entrada.numero)) {
      errores.push(`entry #${entrada.numero} is declared more than once`);
    }
    vistos.add(entrada.numero);
  }

  for (let esperado = 1; esperado <= 21; esperado++) {
    if (!vistos.has(esperado)) {
      errores.push(`entry #${esperado} is missing from the register`);
    }
  }

  return errores;
}

/** `styling-guards` scenario "no entry is left undecided or uses a retired value". */
export function erroresDeDisposicion(registro: readonly EntradaDeRegistro[]): string[] {
  const errores: string[] = [];
  for (const entrada of registro) {
    if (!DISPOSICIONES_VALIDAS.has(entrada.disposicion)) {
      errores.push(
        `entry #${entrada.numero}'s disposition "${entrada.disposicion}" is not one of CSS, JSX, AMBOS, MOOT, RESUELTA`,
      );
    }
  }
  return errores;
}

/**
 * `styling-guards` requirement "every CSS/JSX/AMBOS-dispositioned guard has
 * a passing test in its owning scanner". `MOOT`/`RESUELTA` need no scanner
 * (spec Purpose) and are skipped.
 */
export function erroresDePruebas(
  registro: readonly EntradaDeRegistro[],
  leerArchivo: (rutaRelativa: string) => string | undefined,
): string[] {
  const errores: string[] = [];

  for (const entrada of registro) {
    if (entrada.disposicion === "MOOT" || entrada.disposicion === "RESUELTA") {
      continue;
    }

    const pruebas = entrada.pruebas ?? [];
    if (pruebas.length === 0) {
      errores.push(`entry #${entrada.numero} (${entrada.disposicion}) names no owning test`);
      continue;
    }

    for (const prueba of pruebas) {
      const contenido = leerArchivo(prueba.archivo);
      if (contenido === undefined) {
        errores.push(`entry #${entrada.numero} names ${prueba.archivo}, which does not exist`);
        continue;
      }
      if (!contenido.includes(prueba.titulo)) {
        errores.push(
          `entry #${entrada.numero}'s test "${prueba.titulo}" is not present in ${prueba.archivo} — the guard may have been deleted`,
        );
      }
    }
  }

  return errores;
}

/**
 * `styling-guards` D2 register assertion 3 — every `CSS`/`AMBOS` entry that
 * declares a `src/estilos/*.css` file must have that file still exist, so a
 * lingering `CSS` disposition fails once the last sheet is deleted, rather
 * than silently scanning nothing. `CSS` always requires one. `AMBOS` does
 * not once its CSS half has retired (PR19, task 19.3) — the compiled and
 * JSX scanners carry the protection alone at that point, so `archivoCss` is
 * optional for `AMBOS`; when present it is still checked for existence.
 */
export function erroresDeArchivoCss(
  registro: readonly EntradaDeRegistro[],
  existeArchivo: (rutaRelativa: string) => boolean,
): string[] {
  const errores: string[] = [];

  for (const entrada of registro) {
    if (entrada.disposicion !== "CSS" && entrada.disposicion !== "AMBOS") {
      continue;
    }

    if (!entrada.archivoCss) {
      if (entrada.disposicion === "CSS") {
        errores.push(`entry #${entrada.numero} (${entrada.disposicion}) names no CSS file`);
      }
      continue;
    }

    if (!/^estilos\/.+\.css$/.test(entrada.archivoCss)) {
      errores.push(`entry #${entrada.numero} names "${entrada.archivoCss}", which is not a src/estilos/*.css path`);
      continue;
    }

    if (!existeArchivo(entrada.archivoCss)) {
      errores.push(`entry #${entrada.numero} names ${entrada.archivoCss}, which no longer exists`);
    }
  }

  return errores;
}

/** `styling-guards` D2 register assertion 4 — every `MOOT`/`RESUELTA` entry carries a non-empty reason. */
export function erroresDePorque(registro: readonly EntradaDeRegistro[]): string[] {
  const errores: string[] = [];
  for (const entrada of registro) {
    if (entrada.disposicion === "MOOT" || entrada.disposicion === "RESUELTA") {
      if (!entrada.porque || entrada.porque.trim() === "") {
        errores.push(`entry #${entrada.numero} (${entrada.disposicion}) has no porque`);
      }
    }
  }
  return errores;
}

