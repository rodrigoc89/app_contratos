import { useEffect, useRef } from "react";

interface PropiedadesToast {
  readonly mensaje: string;
  readonly onDescartar: () => void;
}

const DURACION_MS = 5_000;

/**
 * PR26 — the shared surface for exactly three transient confirmations
 * (design.md "Toast" category): "Borrador creado", "Documentos compartidos
 * correctamente." and the signing confirmation. Bottom-anchored, brand
 * colour, high contrast (design-system-migration PR11: redesigned onto
 * Tailwind, `bg-primario`/`text-white`, the same pairing PR7's `Boton`
 * already proved at 7.25:1).
 * `role="status"` is what makes this announced at all — a toast without a
 * live region is invisible to a screen reader, and it is `status` (polite),
 * never `alert`, because nothing breaks if one of these three is missed.
 *
 * Mount-only timer, read through a ref: a caller re-rendering with a fresh
 * `onDescartar` closure (the common React shape) must not restart the 5s
 * window on every render — the toast owns one window from when it first
 * appears, not from whichever render last passed a new closure.
 *
 * The ref is refreshed in an effect, not in the render body. Writing a ref
 * while rendering is a render-purity violation (`react-hooks/refs`): a render
 * is allowed to be thrown away, and a discarded one would leave the ref
 * holding a callback that never committed — the timer would then dismiss
 * through a closure from a render React decided not to keep. StrictMode's
 * double render is NOT the hazard people usually name here; writing the same
 * value twice is idempotent. Neither case is reachable in this app today
 * (nothing in `apps/web/src` uses `startTransition`, `useTransition`,
 * `useDeferredValue`, `Suspense` or `lazy`, so every render commits), which
 * is exactly why it is worth fixing now rather than after the first one
 * arrives and turns this into a bug nobody can reproduce.
 *
 * `useRef(onDescartar)` seeds the ref at mount, so the timer effect below
 * always reads a real callback even on the very first commit.
 */
export function Toast({ mensaje, onDescartar }: PropiedadesToast) {
  const alDescartarRef = useRef(onDescartar);

  // Deliberately no dependency array: this must run after EVERY commit, which
  // is what keeps the ref at the latest callback. `[onDescartar]` would be
  // equivalent here; the bare form states the intent without inviting anyone
  // to "optimise" it into the mount-only version that captures a stale one.
  useEffect(() => {
    alDescartarRef.current = onDescartar;
  });

  useEffect(() => {
    const temporizador = setTimeout(() => alDescartarRef.current(), DURACION_MS);
    return () => clearTimeout(temporizador);
    // No suppression needed: the effect reaches `onDescartar` through
    // `alDescartarRef`, so an empty dependency array is already exhaustive.
  }, []);

  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-4 z-10 flex items-center justify-between gap-3 rounded-base bg-primario p-4 font-semibold text-white"
    >
      <p className="m-0">{mensaje}</p>
      <button
        type="button"
        className="min-h-toque min-w-toque cursor-pointer border-none bg-transparent text-grande text-white"
        aria-label="Cerrar aviso"
        onClick={onDescartar}
      >
        ×
      </button>
    </div>
  );
}
