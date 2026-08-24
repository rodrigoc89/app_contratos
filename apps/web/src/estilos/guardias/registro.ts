/**
 * design.md D2 — the disposition register, closing the hole neither
 * `convencionesDeEstilos.spec.ts` (CSS) nor `convencionesDeUtilidades.spec.ts`/
 * `convencionesDeCompilado.compilado.spec.ts` (JSX/compiled) can see alone: a
 * protection that LEFT one scanner and never ARRIVED in the other.
 *
 * PR3 seeded state: all 21 entries are `CSS` — nothing has converted yet.
 * Task 3.9 flips entries 7, 9-12 to `JSX` once `convencionesDeUtilidades.spec.ts`
 * carries their mechanism (real component coverage still lands in PR8).
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

const ESTILOS = "estilos/convencionesDeEstilos.spec.ts";
const UTILIDADES = "estilos/convencionesDeUtilidades.spec.ts";
const COMPILADO = "estilos/convencionesDeCompilado.compilado.spec.ts";

export const REGISTRO: readonly EntradaDeRegistro[] = [
  {
    // PR6 (design.md slice B) — the collision cluster. CSS half stays:
    // guard 1 bans overflow:hidden/clip anywhere in hand-authored CSS; the
    // compiled half (guard 1/16 shared) additionally scans dist/ output,
    // where Tailwind Preflight and any vendored .sr-only usage are
    // visible; the JSX half bans the literal `sr-only` token at author
    // time, independent of whether a build has run.
    numero: 1,
    protege: "No overflow:hidden/clip anywhere (reading gate) + sr-only token ban",
    disposicion: "AMBOS",
    archivoCss: "estilos/base.css",
    pruebas: [
      { archivo: ESTILOS, titulo: "declares no overflow: hidden / overflow: clip anywhere" },
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
    // output. The CSS-scoped test now proves the negative (no rule was
    // reintroduced); the compiled test proves Preflight's rule is alone.
    // PR14 (final confirmation) — `EscanerDeMac.tsx`'s camera-preview
    // `<video>` redesigns off the retired `.escaner-de-mac__video` BEM
    // class; a rendered component test confirms the converted element is
    // hidden by the `[hidden]` attribute and never by the `hidden` class,
    // whose plain `display: none` a later `cn()` merge could reorder away.
    // `block` beside the attribute is fine — Preflight's rule is `!important`.
    numero: 2,
    protege: "Exactly one !important display declaration ([hidden])",
    disposicion: "AMBOS",
    archivoCss: "estilos/base.css",
    pruebas: [
      {
        archivo: ESTILOS,
        titulo: "declares no project-authored [hidden] rule in estilos/base.css — Preflight's own rule is the sole owner now",
      },
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
    numero: 4,
    protege: "32px gap + destructive colour-not-position (signature actions)",
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
    // GLOBAL `--fuente-base` custom property (tokens.css/base.css's `body`
    // rule) still exists and still governs the rest of the app until PR19
    // deletes those sheets — that unscoped usage was never the buggy
    // rebind-without-readback pattern this half protected against, so
    // disposition stays JSX (the breakpoint-prefix scan is still live).
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
    // `<` comparison does not flag. Separately, `tamanosDeTextoBajoElPiso`'s
    // arbitrary-value pattern only recognises `text-[Nrem]`, not
    // `text-[Npx]` — a second, independent reason a literal px value is
    // invisible to this guard regardless of its numeric size. Falsified
    // both ways: a genuine sub-1rem token (`text-sm`, 0.875rem) on
    // `LayoutTecnico.tsx` and on `LayoutPanel.tsx` (still outside this
    // axis) both correctly fail today, naming the file; `LayoutPanel.tsx`
    // needs no axis entry because it declares no sub-1rem type, not
    // because it is exempt.
    numero: 8,
    protege: "No font-size<1rem outside the panel subtree",
    disposicion: "JSX",
    pruebas: [
      { archivo: UTILIDADES, titulo: "rejects every real .tsx file outside the panel subtree that attempts sub-1rem type" },
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
    // converted component.
    numero: 16,
    protege: "Narrow-layout thead displaced, not clipped",
    disposicion: "AMBOS",
    archivoCss: "estilos/panel.css",
    pruebas: [
      { archivo: ESTILOS, titulo: "moves the narrow-layout thead off-screen instead of only clipping its pixels" },
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
    numero: 18,
    protege: "BEM modifier never declared above the base it overrides",
    disposicion: "CSS",
    archivoCss: "estilos/organismos.css",
    pruebas: [{ archivo: ESTILOS, titulo: "declares every `.%s--*` modifier after the bare `.%s`" }],
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
    numero: 20,
    protege: "Universal touch-floor scan over every interactive control",
    disposicion: "JSX",
    pruebas: [
      { archivo: UTILIDADES, titulo: "finds and clears CampoTexto's and Boton's (every variante x tamano) rendered controls" },
      {
        archivo: UTILIDADES,
        titulo: "clears every non-exempt interactive control, and every EXENCIONES entry corresponds to a real scanned candidate",
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
 * `styling-guards` D2 register assertion 3 — every `CSS`/`AMBOS` entry
 * names a `src/estilos/*.css` file that still exists, so a lingering `CSS`
 * disposition fails once the last sheet is deleted, rather than silently
 * scanning nothing.
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
      errores.push(`entry #${entrada.numero} (${entrada.disposicion}) names no CSS file`);
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

