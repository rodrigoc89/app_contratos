import type { ReactNode } from "react";
import { registerSW } from "virtual:pwa-register";

import { AvisoDeActualizacion } from "../componentes/moleculas/AvisoDeActualizacion";
import { controladorDeActualizacion } from "../pwa/controladorDeActualizacion";
import { usePwaUpdate } from "./usePwaUpdate";

interface PropiedadesRaizConActualizacion {
  readonly children: ReactNode;
}

/**
 * DESIGN.md D9 — the one real, deliberately untested seam for
 * `virtual:pwa-register`, same status `main.tsx` has always had (no spec of
 * its own since PR1). `virtual:pwa-register` is a Vite virtual module: it
 * cannot resolve outside a real Vite/browser build, so it cannot resolve
 * under Vitest either — every decision this wraps (`usePwaUpdate`,
 * `registrarServiceWorker`, `crearControladorDeActualizacion`,
 * `hayTrabajoEnCurso`) is independently unit-tested with an injected
 * `registrar`; this file only wires the real one in, kept separate from
 * `App.tsx` so `App.spec.tsx` stays exactly as it was — no stub plugin
 * needed anywhere in `vitest.config.ts`.
 */
export function RaizConActualizacion({ children }: PropiedadesRaizConActualizacion) {
  const { disponible, aplicar } = usePwaUpdate(registerSW, controladorDeActualizacion);
  return (
    <>
      <AvisoDeActualizacion visible={disponible} onAplicar={aplicar} />
      {children}
    </>
  );
}
