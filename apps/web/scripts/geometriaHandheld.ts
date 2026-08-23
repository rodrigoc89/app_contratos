/**
 * design.md D8 — the handheld geometry harness. Run as `pnpm --filter
 * @contratos/web handheld`, after `pnpm size`/`pnpm test:compilado`, in the
 * `bundle` CI job (after `vite build`, so it drives the real `dist/`).
 *
 * Third of the three "passes by doing nothing" mechanisms `tasks.md`'s
 * preamble names: a short run silently re-measures an earlier state and
 * stays green, rather than returning nothing. `erroresDeCobertura` closes
 * that with two independent checks — an exact states-reached count AND a
 * per-state control-count floor — because the count alone cannot catch a
 * stub that fabricates the committed constant (task 5.1's naive-stub
 * falsification, `geometriaHandheld.spec.ts`).
 *
 * The measured unit is application STATE, not a route: `rutas.tsx` declares
 * one técnico route, and `LienzoDeFirma`/`VisorDeDocumento` are reached only
 * through in-page transitions inside it. **This PR's committed
 * states-reached constant is 5** (S1, S2, S4, S5, S6) — S3 does not exist
 * until PR13 converts those organisms, which bumps this to 6.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { Page } from "puppeteer";

// ── Committed constants ─────────────────────────────────────────────────

/** design.md D8 — 390 is where the two-row `CabeceraDeSesion` regression was measured. */
export const ANCHOS_HANDHELD = [360, 390, 430] as const;

/** Pre-slice-F states-reached constant (task 5.6). PR13 bumps this to 6 once S3 exists. */
export const ESTADOS_ESPERADOS = 5;

/** design.md D8 Assert 2 — the same floor `pisoDeToque.ts` (PR9) will enforce statically. */
export const PISO_DE_TOQUE_PX = 48;

/**
 * S4 (`/panel-no-disponible`) renders exactly one real control ("Cerrar
 * sesión") — the tightest floor in this flow. A floor of 1 never
 * false-fails it, and still catches a stub reporting 0 controls per state.
 */
export const PISO_DE_CONTROLES_POR_ESTADO = 1;

/**
 * design.md D8 Assert 3 — the committed single-row budget for
 * `CabeceraDeSesion` at 390px: `--tamano-toque-minimo` (48px) plus its
 * `padding: var(--espacio-2)` (8px top+bottom) is ~64px for one row, with
 * headroom. The 104px figure design.md cites is the two-row regression this
 * rejects.
 *
 * PR8 (task 8.6/8.7) fixed this: `CabeceraDeSesion` measured 117px
 * (técnico) / 105px (oficina) at 390px before the redesign — a genuine,
 * content-length-independent two-row wrap, reproduced even with a
 * 1-character username — and stays within budget after it. The selector
 * below moved from `.cabecera-sesion` to `[data-cabecera-de-sesion]` in the
 * same PR: the old class's CSS rule (`estilos/organismos.css`) is
 * unlayered, hand-authored `flex-wrap: wrap`, which always outranks
 * Tailwind's `@layer`-wrapped utilities of equal specificity regardless of
 * source order — keeping the old class as an inert hook would have
 * silently reinstated the exact wrap this fix removes.
 */
export const ALTURA_MAXIMA_CABECERA_PX = 72;

// ── Fail-closed assertions (pure — unit-tested on fixtures) ─────────────

export interface PreflightHandheld {
  readonly distDisponible: boolean;
  readonly previewAlcanzable: boolean;
}

/** `handheld-readiness`'s "an absent build or dead preview server fails the harness" scenario. */
export function erroresDePrecondicion(preflight: PreflightHandheld): string[] {
  const errores: string[] = [];
  if (!preflight.distDisponible) {
    errores.push("dist/ is missing or empty — run `pnpm --filter @contratos/web build` before the handheld harness");
  }
  if (!preflight.previewAlcanzable) {
    errores.push("the vite preview server never became reachable");
  }
  return errores;
}

export interface MedicionDeEstado {
  readonly id: string;
  readonly controlesMedidos: number;
}

/**
 * `handheld-readiness`'s fail-closed requirement — two independent checks:
 * an exact states-reached count (a short run must fail, never silently
 * re-measure) AND a per-state control-count floor (the count alone cannot
 * see a fabricated constant with no real measurement behind it — task 5.1).
 */
export function erroresDeCobertura(
  mediciones: readonly MedicionDeEstado[],
  estadosEsperados: number = ESTADOS_ESPERADOS,
  pisoControlesPorEstado: number = PISO_DE_CONTROLES_POR_ESTADO,
): string[] {
  const errores: string[] = [];

  if (mediciones.length !== estadosEsperados) {
    errores.push(
      `reached ${mediciones.length} state(s), expected exactly ${estadosEsperados} for this slice — a short run must fail, not silently re-measure an earlier state`,
    );
  }
  for (const medicion of mediciones) {
    if (medicion.controlesMedidos < pisoControlesPorEstado) {
      errores.push(
        `state ${medicion.id} measured ${medicion.controlesMedidos} control(s), fewer than the committed floor of ${pisoControlesPorEstado}`,
      );
    }
  }

  return errores;
}

/** design.md D8 Assert 1 — `documentElement.scrollWidth === clientWidth`. */
export function hayDesbordeHorizontal(scrollWidth: number, clientWidth: number): boolean {
  return scrollWidth !== clientWidth;
}

/** design.md D8 Assert 2 — every interactive control's box, both axes, `>=`, not `>`. */
export function esControlBajoElPiso(anchoPx: number, altoPx: number, piso: number = PISO_DE_TOQUE_PX): boolean {
  return anchoPx < piso || altoPx < piso;
}

/** design.md D8 Assert 3. */
export function excedeAlturaDeCabecera(alturaPx: number, presupuesto: number = ALTURA_MAXIMA_CABECERA_PX): boolean {
  return alturaPx > presupuesto;
}

// ── Browser driver (CLI only — real Puppeteer, real `vite preview`) ─────

type TipoDeSesion = "ninguna" | "tecnico" | "oficina";

interface EstadoTecnico {
  readonly id: string;
  readonly ruta: string;
  readonly sesion: TipoDeSesion;
  /** Present only once the screen's real content — not its loading state — has rendered. */
  readonly selectorListo: string;
}

/** Committed fixture id, matched by `contratoDetalle.json` and S6's route. */
const ID_CONTRATO_FIXTURE = "fixture-contrato-1";

const ESTADOS: readonly EstadoTecnico[] = [
  { id: "S1", ruta: "/login", sesion: "ninguna", selectorListo: "form.formulario" },
  { id: "S2", ruta: "/", sesion: "tecnico", selectorListo: "form.formulario" },
  { id: "S4", ruta: "/panel-no-disponible", sesion: "tecnico", selectorListo: ".panel-no-disponible" },
  { id: "S5", ruta: "/panel", sesion: "oficina", selectorListo: ".pagina-lista-contratos" },
  {
    id: "S6",
    ruta: `/panel/contratos/${ID_CONTRATO_FIXTURE}`,
    sesion: "oficina",
    selectorListo: ".pagina-detalle-contrato",
  },
];

/**
 * Mirrors `convencionesDeEstilos.spec.ts`'s `ELEMENTOS_INTERACTIVOS` /
 * `EXENCIONES` — the pre-PR9 source of truth. `pisoDeToque.ts` (PR9,
 * design.md D5) is meant to own this list; until it lands there is nothing
 * to import, so this is duplicated deliberately, disclosed here rather than
 * silently, and MUST become an import once PR9 exists (tasks.md 9.1-9.2) —
 * otherwise this is exactly the "two independently-maintained definitions
 * of interactive" failure mode this design warns against.
 */
const ETIQUETAS_INTERACTIVAS = ["a", "button", "input", "select", "textarea", "summary"] as const;
const SELECTORES_EXENTOS = [".tabla-de-contratos tbody tr", ".tabla-de-contratos__desplazamiento"] as const;

/** `almacenSesion.ts`'s `CLAVE_TOKEN_DE_REFRESCO` — not exported there, kept in sync by name. */
const CLAVE_TOKEN_DE_REFRESCO = "contratos.sesion.tokenDeRefresco";
const TOKEN_REFRESCO_FIXTURE = "fixture-token-refresco";

const PUERTO_PREVIEW = 4174;
const URL_PREVIEW = `http://127.0.0.1:${PUERTO_PREVIEW}`;

interface FixturesCargados {
  readonly sesionTecnico: unknown;
  readonly sesionOficina: unknown;
  readonly listaContratos: unknown;
  readonly contratoDetalle: unknown;
}

async function cargarFixture(nombre: string): Promise<unknown> {
  const ruta = join(import.meta.dirname, "fixtures", "handheld", nombre);
  return JSON.parse(await readFile(ruta, "utf-8")) as unknown;
}

async function cargarTodosLosFixtures(): Promise<FixturesCargados> {
  const [sesionTecnico, sesionOficina, listaContratos, contratoDetalle] = await Promise.all([
    cargarFixture("sesionTecnico.json"),
    cargarFixture("sesionOficina.json"),
    cargarFixture("listaContratos.json"),
    cargarFixture("contratoDetalle.json"),
  ]);
  return { sesionTecnico, sesionOficina, listaContratos, contratoDetalle };
}

/**
 * `estadoSesion.ts` persists only the refresh token (DESIGN.md D4). Seeding
 * this is what makes `usarRestauracionDeSesion` call `refrescarSesion()` on
 * mount, which the intercepted `/auth/refresh` below answers from a fixture.
 */
async function sembrarSesion(pagina: Page, sesion: TipoDeSesion): Promise<void> {
  if (sesion === "ninguna") {
    return;
  }
  await pagina.evaluateOnNewDocument(
    (clave: string, valor: string) => localStorage.setItem(clave, valor),
    CLAVE_TOKEN_DE_REFRESCO,
    TOKEN_REFRESCO_FIXTURE,
  );
}

/** "No API, no Postgres" (design.md D8) — `/auth/*`/`/contratos/*` are fulfilled from fixtures; everything else passes through. */
async function interceptar(pagina: Page, sesion: TipoDeSesion, fixtures: FixturesCargados): Promise<void> {
  await pagina.setRequestInterception(true);
  pagina.on("request", (peticion) => {
    const url = new URL(peticion.url());

    if (peticion.method() === "POST" && url.pathname === "/auth/refresh") {
      const cuerpo = sesion === "oficina" ? fixtures.sesionOficina : fixtures.sesionTecnico;
      void peticion.respond({ status: 200, contentType: "application/json", body: JSON.stringify(cuerpo) });
      return;
    }
    if (peticion.method() === "GET" && url.pathname === "/contratos") {
      void peticion.respond({ status: 200, contentType: "application/json", body: JSON.stringify(fixtures.listaContratos) });
      return;
    }
    if (peticion.method() === "GET" && url.pathname === `/contratos/${ID_CONTRATO_FIXTURE}`) {
      void peticion.respond({ status: 200, contentType: "application/json", body: JSON.stringify(fixtures.contratoDetalle) });
      return;
    }
    void peticion.continue();
  });
}

interface MedicionCruda {
  readonly scrollWidth: number;
  readonly clientWidth: number;
  readonly controles: ReadonlyArray<{ readonly ancho: number; readonly alto: number }>;
  readonly alturaCabecera: number | null;
}

/** Runs inside the page (`page.evaluate` serialises this). */
async function medirEstado(
  pagina: Page,
  etiquetas: readonly string[],
  exentos: readonly string[],
): Promise<MedicionCruda> {
  return await pagina.evaluate(
    (etiquetas: string[], exentos: string[]) => {
      const nodosExentos = new Set(exentos.flatMap((selector) => Array.from(document.querySelectorAll(selector))));
      const controles = etiquetas
        .flatMap((etiqueta) => Array.from(document.getElementsByTagName(etiqueta)) as HTMLElement[])
        .filter((elemento) => !nodosExentos.has(elemento))
        // A control hidden by `display: none` — its own or an ancestor's
        // (`Paginador`'s numbered-page list, hidden below 640px by design)
        // is not a target a técnico can miss. An element's OWN computed
        // `display` does not reflect an ancestor's `display: none`, so
        // `offsetParent === null` is the check that actually detects it —
        // `position: fixed` is the one exception, unused in this flow.
        .filter((elemento) => !(elemento.getBoundingClientRect().width === 0 && elemento.offsetParent === null))
        .map((elemento) => {
          const caja = elemento.getBoundingClientRect();
          return { ancho: caja.width, alto: caja.height };
        });
      const cabecera = document.querySelector("[data-cabecera-de-sesion]");

      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        controles,
        alturaCabecera: cabecera === null ? null : cabecera.getBoundingClientRect().height,
      };
    },
    etiquetas as string[],
    exentos as string[],
  );
}

function spawnServidorPreview(): ChildProcess {
  return spawn("pnpm", ["exec", "vite", "preview", "--port", String(PUERTO_PREVIEW), "--strictPort"], {
    cwd: join(import.meta.dirname, ".."),
    stdio: "ignore",
  });
}

async function esperarPreview(url: string, intentos = 40, esperaMs = 250): Promise<boolean> {
  for (let intento = 0; intento < intentos; intento += 1) {
    try {
      const respuesta = await fetch(url);
      if (respuesta.status < 500) {
        return true;
      }
    } catch {
      // Not up yet — retried below.
    }
    await new Promise((resolver) => setTimeout(resolver, esperaMs));
  }
  return false;
}

function distDisponible(): boolean {
  const directorioDist = join(import.meta.dirname, "..", "dist");
  return existsSync(directorioDist) && readdirSync(directorioDist).length > 0;
}

function reportarFalla(errores: readonly string[]): void {
  console.error("=== handheld geometry harness (design.md D8) — FAILED ===");
  for (const error of errores) {
    console.error(`  - ${error}`);
  }
  process.exitCode = 1;
}

async function medirTodo(fixtures: FixturesCargados): Promise<{ mediciones: MedicionDeEstado[]; problemas: string[] }> {
  const { default: puppeteer } = await import("puppeteer");
  const navegador = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  const mediciones: MedicionDeEstado[] = [];
  const problemas: string[] = [];

  try {
    for (const estado of ESTADOS) {
      for (const ancho of ANCHOS_HANDHELD) {
        const pagina = await navegador.newPage();
        try {
          // Trap 1 (design.md D8) — a live service worker answers from the
          // precache and races interception, measuring a stale build.
          await pagina.setBypassServiceWorker(true);
          await sembrarSesion(pagina, estado.sesion);
          await interceptar(pagina, estado.sesion, fixtures);
          await pagina.setViewport({ width: ancho, height: 800, isMobile: true, hasTouch: true });
          await pagina.goto(`${URL_PREVIEW}${estado.ruta}`, { waitUntil: "networkidle0", timeout: 15_000 });
          await pagina.waitForSelector(estado.selectorListo, { timeout: 10_000 });
          await pagina.waitForFunction(() => document.querySelector(".progreso") === null, { timeout: 10_000 });

          const medicion = await medirEstado(pagina, ETIQUETAS_INTERACTIVAS, SELECTORES_EXENTOS);

          if (hayDesbordeHorizontal(medicion.scrollWidth, medicion.clientWidth)) {
            problemas.push(
              `${estado.id}@${ancho}px: horizontal overflow (scrollWidth ${medicion.scrollWidth} !== clientWidth ${medicion.clientWidth})`,
            );
          }
          const bajoElPiso = medicion.controles.filter((control) => esControlBajoElPiso(control.ancho, control.alto));
          if (bajoElPiso.length > 0) {
            problemas.push(`${estado.id}@${ancho}px: ${bajoElPiso.length} control(s) under the ${PISO_DE_TOQUE_PX}px touch floor`);
          }
          if (ancho === 390 && medicion.alturaCabecera !== null && excedeAlturaDeCabecera(medicion.alturaCabecera)) {
            problemas.push(
              `${estado.id}@390px: CabeceraDeSesion measured ${medicion.alturaCabecera}px, over the ${ALTURA_MAXIMA_CABECERA_PX}px single-row budget`,
            );
          }
          if (ancho === ANCHOS_HANDHELD[0]) {
            mediciones.push({ id: estado.id, controlesMedidos: medicion.controles.length });
          }
        } finally {
          await pagina.close();
        }
      }
    }
  } finally {
    await navegador.close();
  }

  return { mediciones, problemas };
}

async function ejecutar(): Promise<void> {
  const proceso = spawnServidorPreview();
  try {
    const previewAlcanzable = await esperarPreview(URL_PREVIEW);
    const erroresPrecondicion = erroresDePrecondicion({ distDisponible: distDisponible(), previewAlcanzable });
    if (erroresPrecondicion.length > 0) {
      reportarFalla(erroresPrecondicion);
      return;
    }

    const fixtures = await cargarTodosLosFixtures();
    const { mediciones, problemas } = await medirTodo(fixtures);
    const errores = [...erroresDeCobertura(mediciones), ...problemas];

    if (errores.length > 0) {
      reportarFalla(errores);
      return;
    }

    console.log("=== handheld geometry harness (design.md D8) ===");
    console.log(`states reached: ${mediciones.length}/${ESTADOS_ESPERADOS}`);
    console.log("verdict: PASS");
  } finally {
    proceso.kill();
  }
}

// Only run as a CLI entry point — importing the pure functions for a test
// must not also launch a browser and a preview server as a side effect.
if (import.meta.url === `file://${process.argv[1]}`) {
  await ejecutar();
}
