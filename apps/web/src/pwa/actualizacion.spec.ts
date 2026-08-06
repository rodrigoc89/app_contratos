import { describe, expect, it } from "vitest";

import { crearControladorDeActualizacion } from "./actualizacion";

/**
 * DESIGN.md D9 — the decisive safety property, isolated from React and from
 * `vite-plugin-pwa`'s virtual module entirely: a new service worker version
 * being available must never, by itself, produce an "apply now" decision
 * while `hayTrabajoEnCurso()` is true. `registerType: "prompt"` +
 * `skipWaiting: false` (proven separately in `configuracionPwa.spec.ts`)
 * already stops the browser from swapping the app out unprompted; this
 * controller is the second half — the app-level code must not prompt or
 * auto-apply either, until it is safe.
 */
describe("crearControladorDeActualizacion", () => {
  it("starts with no update pending", () => {
    const controlador = crearControladorDeActualizacion(() => false);

    expect(controlador.estado).toEqual({ tipo: "sin_novedad" });
  });

  it("a new version while work is in progress moves to 'esperando_fin_de_visita', never 'disponible'", () => {
    const controlador = crearControladorDeActualizacion(() => true);

    controlador.notificarNuevaVersion();

    expect(controlador.estado).toEqual({ tipo: "esperando_fin_de_visita" });
  });

  it("a new version while nothing is in progress moves straight to 'disponible'", () => {
    const controlador = crearControladorDeActualizacion(() => false);

    controlador.notificarNuevaVersion();

    expect(controlador.estado).toEqual({ tipo: "disponible" });
  });

  it("reevaluar() promotes a suppressed update to 'disponible' once work finishes, mid-session — no cold start required", () => {
    let ocupado = true;
    const controlador = crearControladorDeActualizacion(() => ocupado);

    controlador.notificarNuevaVersion();
    expect(controlador.estado).toEqual({ tipo: "esperando_fin_de_visita" });

    ocupado = false;
    controlador.reevaluar();

    expect(controlador.estado).toEqual({ tipo: "disponible" });
  });

  it("reevaluar() re-suppresses if new work starts again before the technician applies the update", () => {
    let ocupado = false;
    const controlador = crearControladorDeActualizacion(() => ocupado);
    controlador.notificarNuevaVersion();
    expect(controlador.estado).toEqual({ tipo: "disponible" });

    ocupado = true;
    controlador.reevaluar();

    expect(controlador.estado).toEqual({ tipo: "esperando_fin_de_visita" });
  });

  it("reevaluar() with no version notified yet is a no-op — it never invents an update", () => {
    const controlador = crearControladorDeActualizacion(() => false);

    controlador.reevaluar();

    expect(controlador.estado).toEqual({ tipo: "sin_novedad" });
  });
});
