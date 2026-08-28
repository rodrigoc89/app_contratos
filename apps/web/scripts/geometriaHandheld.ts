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
 * through in-page transitions inside it. **PR13's committed states-reached
 * constant is 6** (S1, S2, S4, S5, S6, S3) — S3 is driven now that both
 * organisms it reaches have converted off BEM. PR13 also adds guard 19's
 * runtime half (`elementFromPoint`, real Chrome only) and makes a drifted
 * visit-script selector report as unreached, not crash.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { Page } from "puppeteer";

// ── Committed constants ─────────────────────────────────────────────────

/** design.md D8 — 390 is where the two-row `CabeceraDeSesion` regression was measured. */
export const ANCHOS_HANDHELD = [360, 390, 430] as const;

/** Slice-F states-reached constant (task 13.5) — S1, S2, S4, S5, S6, S3. */
export const ESTADOS_ESPERADOS = 6;

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

/** design.md D1 — the evidence a failed reachability wait carries, so the verdict is diagnosable, not just nameable. */
export interface DiagnosticoDePreview {
  readonly intentos: number;
  readonly transcurridoMs: number;
  /** `"exit 1"` | `"signal SIGTERM"` | `"spawn error: …"` | `"still running"`. */
  readonly finDelProceso: string;
  readonly ultimoErrorDeSondeo: string;
  readonly salidaCapturada: string;
}

/** design.md D1 — converges on the same `exito`-discriminated shape `ResultadoAlcance` already uses. */
export type ResultadoDePreview =
  | { readonly exito: true; readonly direccion: string; readonly intentos: number; readonly transcurridoMs: number }
  | { readonly exito: false; readonly diagnostico: DiagnosticoDePreview };

export interface PreflightHandheld {
  readonly distDisponible: boolean;
  readonly alcanceDelPreview: ResultadoDePreview;
}

/** `handheld-readiness`'s "an absent build or dead preview server fails the harness" scenario. */
export function erroresDePrecondicion(preflight: PreflightHandheld): string[] {
  const errores: string[] = [];
  if (!preflight.distDisponible) {
    errores.push("dist/ is missing or empty — run `pnpm --filter @contratos/web build` before the handheld harness");
  }
  if (!preflight.alcanceDelPreview.exito) {
    const { intentos, transcurridoMs, finDelProceso, ultimoErrorDeSondeo, salidaCapturada } =
      preflight.alcanceDelPreview.diagnostico;
    errores.push(
      `the vite preview server never became reachable — attempts: ${intentos}, elapsed: ${transcurridoMs}ms, ` +
        `process: ${finDelProceso}, last probe error: ${ultimoErrorDeSondeo}, captured output: ${salidaCapturada}`,
    );
  }
  return errores;
}

/**
 * design.md D2 — the listener always consumes; the buffer is bounded, not
 * the drain. Both streams write into one instance so the cap covers their
 * combined total, not each independently.
 */
export const LIMITE_CAPTURA_BYTES = 16_384;

export interface BufferAcotado {
  readonly agregar: (fragmento: string) => void;
  readonly texto: () => string;
}

/** Truncates to at most `maxBytes` UTF-8 bytes without assuming ASCII input. */
function truncarABytes(texto: string, maxBytes: number): string {
  if (maxBytes <= 0) {
    return "";
  }
  const bytes = Buffer.from(texto, "utf-8");
  if (bytes.byteLength <= maxBytes) {
    return texto;
  }
  return bytes.subarray(0, maxBytes).toString("utf-8");
}

/**
 * design.md D2 — keep-first-bytes eviction: the banner and startup error are
 * at the beginning, and a request-log flood must not evict them. Overflow
 * always announces itself with the exact dropped-byte count, never silently.
 */
export function crearBufferAcotado(limiteBytes: number = LIMITE_CAPTURA_BYTES): BufferAcotado {
  let guardado = "";
  let bytesGuardados = 0;
  let bytesTotales = 0;

  return {
    agregar(fragmento: string): void {
      bytesTotales += Buffer.byteLength(fragmento, "utf-8");
      if (bytesGuardados >= limiteBytes) {
        return;
      }
      const espacioDisponible = limiteBytes - bytesGuardados;
      const aGuardar = truncarABytes(fragmento, espacioDisponible);
      guardado += aGuardar;
      bytesGuardados += Buffer.byteLength(aGuardar, "utf-8");
    },
    texto(): string {
      const bytesDescartados = bytesTotales - bytesGuardados;
      return bytesDescartados > 0 ? `${guardado}… (${bytesDescartados} more bytes dropped)` : guardado;
    },
  };
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

/**
 * Guard 19's runtime half (task 13.1/13.4/13.5). `Element` cannot cross
 * `page.evaluate()`'s serialization boundary, so `medirCoberturaDeControles`
 * resolves `document.elementFromPoint` INSIDE the page and returns these two
 * plain booleans; this pure function decides pass/fail, unit-tested on fixtures.
 */
export interface ResultadoCoberturaControl {
  readonly esElControl: boolean;
  readonly esDescendienteDelControl: boolean;
}

/** True when the element under a control's centre is neither the control nor a descendant of it (the historical iframe-overlap bug). */
export function controlTapadoPorOtroElemento(resultado: ResultadoCoberturaControl): boolean {
  return !resultado.esElControl && !resultado.esDescendienteDelControl;
}

// ── Browser driver (CLI only — real Puppeteer, real `vite preview`) ─────

type TipoDeSesion = "ninguna" | "tecnico" | "oficina";

interface EstadoTecnico {
  readonly id: string;
  readonly ruta: string;
  readonly sesion: TipoDeSesion;
  /** Present only once the screen's real content — not its loading state — has rendered. */
  readonly selectorListo: string;
  /** S3 only (design.md D8) — drives the in-page transitions `ruta` alone cannot reach. Runs after `goto`, before `selectorListo` is awaited. */
  readonly visitar?: (pagina: Page) => Promise<void>;
}

/** Committed fixture id, matched by `contratoDetalle.json` and S6's route. */
const ID_CONTRATO_FIXTURE = "fixture-contrato-1";

/** S3's own created-draft fixture id (`contratoCreado.json`) — distinct from S6's, since the two are unrelated contracts. */
const ID_CONTRATO_CREADO_FIXTURE = "fixture-contrato-creado-1";

/** design.md D8 — S3's committed visit-script field values, filled into the real `FormularioBorrador`. */
const DATOS_VISITA_S3 = {
  nombreCompleto: "Fixture Cliente Handheld", dni: "30111222", domicilioCalle: "Av. Fixture 123",
  ciudad: "Córdoba", whatsapp: "+5493511234567", antenaModelo: "Ubiquiti LiteBeam",
  antenaMac: "AA:BB:CC:DD:EE:FF", canoMetros: "12",
} as const;

/**
 * S3's visit script (design.md D8, task 13.4/13.5) — the most brittle piece
 * of this harness: fills the real `FormularioBorrador` across both steps,
 * submits (`POST /contratos` intercepted below), then taps the
 * post-creation "Continuar" to reach `EnvioDeFirma`/`PasoFirmaDual`. A
 * drift in either the field `id`s or the submit label is exactly what
 * `handheld-readiness`'s drift scenario requires this to report.
 */
async function completarVisitaTecnica(pagina: Page): Promise<void> {
  await pagina.waitForSelector("#nombreCompleto", { timeout: 10_000 });
  for (const campo of ["nombreCompleto", "dni", "domicilioCalle", "ciudad", "whatsapp"] as const) {
    await pagina.type(`#${campo}`, DATOS_VISITA_S3[campo]);
  }
  await pagina.click('form[data-formulario] button[type="submit"]');

  await pagina.waitForSelector("#antenaModelo", { timeout: 10_000 });
  await pagina.type("#antenaModelo", DATOS_VISITA_S3.antenaModelo);
  await pagina.type("#antenaMac", DATOS_VISITA_S3.antenaMac);
  await pagina.click('input[name="poe"]');
  await pagina.type("#canoMetros", DATOS_VISITA_S3.canoMetros);
  // "Crear borrador" — POST /contratos, intercepted below.
  await pagina.click('form[data-formulario] button[type="submit"]');

  // The same submit button re-renders as "Continuar" once the draft exists
  // (`FormularioBorrador`'s `etiquetaEnvio`) — waited for by content, not by
  // a fixed delay, since the POST's own round trip is what changes it.
  await pagina.waitForFunction(
    () => {
      const boton = document.querySelector('form[data-formulario] button[type="submit"]');
      return boton !== null && boton.textContent?.trim() === "Continuar";
    },
    { timeout: 10_000 },
  );

  // `Toast.tsx` is `fixed inset-x-4 bottom-4` — the "Borrador creado" banner
  // can sit directly over the equipos step's own bottom submit button on a
  // short viewport, so dismissing it ("Cerrar aviso") first is what makes
  // the real "Continuar" tap land on the real button, not the toast.
  const cerrarAviso = await pagina.$('button[aria-label="Cerrar aviso"]');
  if (cerrarAviso !== null) {
    await cerrarAviso.click();
  }

  await pagina.click('form[data-formulario] button[type="submit"]');
  await pagina.waitForSelector('iframe[title="Condiciones Generales de Uso"]', { timeout: 10_000 });
}

const ESTADOS: readonly EstadoTecnico[] = [
  { id: "S1", ruta: "/login", sesion: "ninguna", selectorListo: "form[data-formulario]" },
  { id: "S2", ruta: "/", sesion: "tecnico", selectorListo: "form[data-formulario]" },
  { id: "S4", ruta: "/panel-no-disponible", sesion: "tecnico", selectorListo: "[data-panel-no-disponible]" },
  { id: "S5", ruta: "/panel", sesion: "oficina", selectorListo: "[data-pagina-lista-contratos]" },
  {
    id: "S6",
    ruta: `/panel/contratos/${ID_CONTRATO_FIXTURE}`,
    sesion: "oficina",
    selectorListo: "[data-pagina-detalle-contrato]",
  },
  {
    // Appended last, matching design.md D8's committed ordering — not
    // renumbered into route order. Drives LienzoDeFirma/VisorDeDocumento.
    id: "S3",
    ruta: "/",
    sesion: "tecnico",
    selectorListo: 'iframe[title="Condiciones Generales de Uso"]',
    visitar: completarVisitaTecnica,
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
  readonly contratoCreado: unknown; // S3 only — `POST /contratos`'s response.
  readonly previsualizacion: unknown; // S3 only — `GET /contratos/:id/previsualizacion`'s response.
}

async function cargarFixture(nombre: string): Promise<unknown> {
  const ruta = join(import.meta.dirname, "fixtures", "handheld", nombre);
  return JSON.parse(await readFile(ruta, "utf-8")) as unknown;
}

async function cargarTodosLosFixtures(): Promise<FixturesCargados> {
  const [sesionTecnico, sesionOficina, listaContratos, contratoDetalle, contratoCreado, previsualizacion] =
    await Promise.all([
      cargarFixture("sesionTecnico.json"),
      cargarFixture("sesionOficina.json"),
      cargarFixture("listaContratos.json"),
      cargarFixture("contratoDetalle.json"),
      cargarFixture("contratoCreado.json"),
      cargarFixture("previsualizacion.json"),
    ]);
  return { sesionTecnico, sesionOficina, listaContratos, contratoDetalle, contratoCreado, previsualizacion };
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
    if (peticion.method() === "POST" && url.pathname === "/contratos") {
      void peticion.respond({ status: 200, contentType: "application/json", body: JSON.stringify(fixtures.contratoCreado) });
      return;
    }
    if (peticion.method() === "GET" && url.pathname === `/contratos/${ID_CONTRATO_CREADO_FIXTURE}/previsualizacion`) {
      void peticion.respond({ status: 200, contentType: "application/json", body: JSON.stringify(fixtures.previsualizacion) });
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

interface CoberturaControlCruda extends ResultadoCoberturaControl {
  readonly id: string;
  readonly etiquetaDelElementoEncontrado: string;
}

/**
 * S3 only — real `elementFromPoint` at each `Deshacer`/`Borrar` centre.
 * `PasoFirmaDual` renders one pair per document, so every matching button
 * is hit-tested. `scrollIntoView` first — the emulated viewport does not
 * fit both `LienzoDeFirma` instances, and a point outside it hits nothing.
 */
async function medirCoberturaDeControles(pagina: Page): Promise<readonly CoberturaControlCruda[]> {
  return await pagina.evaluate(() => {
    function medir(boton: HTMLButtonElement) {
      boton.scrollIntoView({ block: "center", inline: "center" });
      const rect = boton.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const elementoEnPunto = document.elementFromPoint(cx, cy);
      return {
        esElControl: elementoEnPunto === boton,
        esDescendienteDelControl: elementoEnPunto !== null && boton.contains(elementoEnPunto),
        etiquetaDelElementoEncontrado:
          elementoEnPunto === null
            ? "(nothing — point outside the viewport)"
            : elementoEnPunto.tagName.toLowerCase() +
              (elementoEnPunto.className ? `.${elementoEnPunto.className.trim().replaceAll(/\s+/g, ".")}` : ""),
      };
    }

    const botones = Array.from(document.querySelectorAll("button"));
    return ["Deshacer", "Borrar"].flatMap((texto) =>
      botones
        .filter((boton) => boton.textContent?.trim() === texto)
        .map((boton, indice) => ({ id: `${texto.toLowerCase()}-${indice}`, ...medir(boton) })),
    );
  });
}

// eslint-disable-next-line no-control-regex -- deliberately matches the ESC byte to strip vite's ANSI color codes.
const CODIGO_ANSI = /\x1b\[[0-9;]*m/g;

/** design.md D3 — the honest fallback `direccionInformada` returns; never invents an address. */
export const SIN_DIRECCION_INFORMADA = "(vite printed no address before the first successful probe)";

/**
 * design.md D3 — pure, first `Local:` line with ANSI codes stripped; the
 * honest fallback when vite has not printed one yet. Never invents an
 * address — what it proves is narrower than it looks (see design D4): it
 * confirms the `--host` flag reached vite, not the socket vite bound.
 */
export function direccionInformada(salidaCapturada: string): string {
  for (const linea of salidaCapturada.split("\n")) {
    const sinAnsi = linea.replace(CODIGO_ANSI, "").trim();
    if (sinAnsi.includes("Local:")) {
      return sinAnsi;
    }
  }
  return SIN_DIRECCION_INFORMADA;
}

interface ServidorPreview {
  readonly proceso: ChildProcess;
  readonly buffer: BufferAcotado;
}

/**
 * design.md D2/D4 — stdio piped so stdout/stderr can be captured instead of
 * discarded; `"data"` listeners attached synchronously at spawn, before any
 * output can arrive, into one `crearBufferAcotado()` covering both streams.
 * `--host 127.0.0.1` (task 3.7/D4) pins the bind to match the IPv4 literal
 * the probe already uses.
 */
function spawnServidorPreview(): ServidorPreview {
  const proceso = spawn(
    "pnpm",
    ["exec", "vite", "preview", "--host", "127.0.0.1", "--port", String(PUERTO_PREVIEW), "--strictPort"],
    {
      cwd: join(import.meta.dirname, ".."),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const buffer = crearBufferAcotado();
  proceso.stdout?.on("data", (fragmento: Buffer) => buffer.agregar(fragmento.toString("utf-8")));
  proceso.stderr?.on("data", (fragmento: Buffer) => buffer.agregar(fragmento.toString("utf-8")));
  return { proceso, buffer };
}

/**
 * design.md D3/D4 — the real `SondaDePreview`: `sondear` is a thin `fetch`
 * wrapper, `estadoDelProceso` is backed by the child's own `"exit"`/`"error"`
 * listeners (R1's crash signal), `salida` reads the always-draining buffer.
 */
function crearSondaReal(proceso: ChildProcess, buffer: BufferAcotado): SondaDePreview {
  let estadoProceso: string | null = null;
  proceso.once("exit", (codigo, señal) => {
    estadoProceso ??= señal !== null ? `signal ${señal}` : `exit ${codigo ?? 0}`;
  });
  proceso.once("error", (error) => {
    estadoProceso ??= `spawn error: ${error.message}`;
  });

  return {
    sondear: async (url: string) => (await fetch(url)).status,
    dormir: (ms: number) => new Promise((resolver) => setTimeout(resolver, ms)),
    ahora: () => Date.now(),
    estadoDelProceso: () => estadoProceso,
    salida: () => buffer.texto(),
  };
}

/**
 * design.md D3 — the seam that lets `esperarPreview` be tested without a
 * real subprocess or network. `sondear` mirrors `fetch`'s contract (rejects
 * on connection failure, resolves with a status code); `estadoDelProceso`
 * mirrors the real child's `"exit"`/`"error"` listeners.
 */
export interface SondaDePreview {
  readonly sondear: (url: string) => Promise<number>;
  readonly dormir: (ms: number) => Promise<void>;
  readonly ahora: () => number;
  readonly estadoDelProceso: () => string | null;
  readonly salida: () => string;
}

/** design.md D3(a) — the bounded grace that lets trailing stdout/stderr flush before the diagnostic is built. */
const GRACIA_CIERRE_MS = 250;

function construirDiagnostico(
  sonda: SondaDePreview,
  intentos: number,
  inicio: number,
  ultimoErrorDeSondeo: string,
): DiagnosticoDePreview {
  return {
    intentos,
    transcurridoMs: sonda.ahora() - inicio,
    finDelProceso: sonda.estadoDelProceso() ?? "still running",
    ultimoErrorDeSondeo,
    salidaCapturada: sonda.salida(),
  };
}

/**
 * design.md D3 — polls the child's terminal state at the top of each
 * attempt instead of racing it against the probe (R1: a crash ends the
 * wait immediately, without consuming the remaining polling budget).
 */
export async function esperarPreview(
  url: string,
  sonda: SondaDePreview,
  intentos = 40,
  esperaMs = 250,
): Promise<ResultadoDePreview> {
  const inicio = sonda.ahora();
  let ultimoErrorDeSondeo = "(no probe attempted yet)";

  for (let intento = 1; intento <= intentos; intento += 1) {
    if (sonda.estadoDelProceso() !== null) {
      await sonda.dormir(GRACIA_CIERRE_MS);
      return { exito: false, diagnostico: construirDiagnostico(sonda, intento, inicio, ultimoErrorDeSondeo) };
    }

    try {
      const estado = await sonda.sondear(url);
      if (estado < 500) {
        // design.md D3(b) — printUrls() runs after listen, so the banner
        // print and the first successful probe race; poll briefly for it.
        const limiteBanner = sonda.ahora() + esperaMs * 2;
        while (direccionInformada(sonda.salida()) === SIN_DIRECCION_INFORMADA && sonda.ahora() < limiteBanner) {
          await sonda.dormir(esperaMs);
        }
        return {
          exito: true,
          direccion: direccionInformada(sonda.salida()),
          intentos: intento,
          transcurridoMs: sonda.ahora() - inicio,
        };
      }
      ultimoErrorDeSondeo = `HTTP ${estado}`;
    } catch (error) {
      ultimoErrorDeSondeo = error instanceof Error ? error.message : String(error);
    }

    await sonda.dormir(esperaMs);
  }

  return { exito: false, diagnostico: construirDiagnostico(sonda, intentos, inicio, ultimoErrorDeSondeo) };
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

type ResultadoAlcance = { readonly exito: true } | { readonly exito: false; readonly motivo: string };

/**
 * Navigates to `estado` and drives S3's visit script if present, catching
 * any failure instead of letting it crash `medirTodo` — a drifted selector
 * (`handheld-readiness`'s drift scenario) is reported as unreached via
 * `erroresDeCobertura` below, never an uncaught stack trace.
 */
async function intentarAlcanzarEstado(
  pagina: Page,
  estado: EstadoTecnico,
  ancho: number,
  fixtures: FixturesCargados,
): Promise<ResultadoAlcance> {
  try {
    // Trap 1 (design.md D8) — a live service worker answers from the
    // precache and races interception, measuring a stale build.
    await pagina.setBypassServiceWorker(true);
    await sembrarSesion(pagina, estado.sesion);
    await interceptar(pagina, estado.sesion, fixtures);
    await pagina.setViewport({ width: ancho, height: 800, isMobile: true, hasTouch: true });
    await pagina.goto(`${URL_PREVIEW}${estado.ruta}`, { waitUntil: "networkidle0", timeout: 15_000 });
    if (estado.visitar) {
      await estado.visitar(pagina);
    }
    await pagina.waitForSelector(estado.selectorListo, { timeout: 10_000 });
    await pagina.waitForFunction(() => document.querySelector("[data-progreso]") === null, { timeout: 10_000 });
    return { exito: true };
  } catch (motivo) {
    return { exito: false, motivo: motivo instanceof Error ? motivo.message : String(motivo) };
  }
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
          const alcance = await intentarAlcanzarEstado(pagina, estado, ancho, fixtures);
          if (!alcance.exito) {
            problemas.push(`${estado.id}@${ancho}px: failed to reach this state (${alcance.motivo}) — treated as unreached, not a crash`);
            continue;
          }

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

          // Guard 19's runtime half (task 13.1/13.4/13.5) — S3 only, the one
          // state that actually renders Deshacer/Borrar.
          if (estado.id === "S3") {
            const coberturas = await medirCoberturaDeControles(pagina);
            for (const cobertura of coberturas) {
              if (controlTapadoPorOtroElemento(cobertura)) {
                problemas.push(
                  `${estado.id}@${ancho}px: ${cobertura.id} is covered by ${cobertura.etiquetaDelElementoEncontrado} instead of being the elementFromPoint hit itself (guard 19)`,
                );
              }
            }
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
  const { proceso, buffer } = spawnServidorPreview();
  try {
    const sonda = crearSondaReal(proceso, buffer);
    const alcanceDelPreview = await esperarPreview(URL_PREVIEW, sonda);
    const erroresPrecondicion = erroresDePrecondicion({ distDisponible: distDisponible(), alcanceDelPreview });
    if (erroresPrecondicion.length > 0) {
      reportarFalla(erroresPrecondicion);
      return;
    }

    // R2b/R2c — reported unconditionally: `direccion` already carries
    // either the real announced address or `direccionInformada`'s honest
    // "no address available" fallback, so both scenarios are covered here.
    if (alcanceDelPreview.exito) {
      console.log(
        `preview reachable: ${alcanceDelPreview.direccion} ` +
          `(attempts: ${alcanceDelPreview.intentos}, elapsed: ${alcanceDelPreview.transcurridoMs}ms)`,
      );
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
    // design.md D6 — load-bearing for the fail-closed requirement, not
    // hygiene: reportarFalla only sets process.exitCode, delivered only
    // once the event loop drains. A surviving descendant holding the piped
    // stdout/stderr's write end keeps the loop alive and the exit code
    // undelivered, so a 10-second honest failure becomes a CI timeout kill
    // instead of a named failure.
    proceso.kill();
    proceso.stdout?.destroy();
    proceso.stderr?.destroy();
  }
}

// Only run as a CLI entry point — importing the pure functions for a test
// must not also launch a browser and a preview server as a side effect.
if (import.meta.url === `file://${process.argv[1]}`) {
  await ejecutar();
}
