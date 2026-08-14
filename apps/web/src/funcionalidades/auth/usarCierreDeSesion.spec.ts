import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { cerrarSesion } from "../../datos/sesion/sesion";
import { usarCierreDeSesion } from "./usarCierreDeSesion";

vi.mock("../../datos/sesion/sesion", () => ({ cerrarSesion: vi.fn() }));
const cerrar = vi.mocked(cerrarSesion);

const navegar = vi.fn();
vi.mock("react-router-dom", async (original) => ({
  ...(await original<typeof import("react-router-dom")>()),
  useNavigate: () => navegar,
}));

/**
 * "Log out, then navigate" existed twice — `CabeceraDeSesion` and
 * `PanelNoDisponible` — and the second was a copy of the first made before
 * the first was fixed. PR #61 taught `CabeceraDeSesion` to survive a
 * rejecting `cerrarSesion`; the copy kept stranding the person on the screen
 * they tapped to leave, because a copy inherits the shape of a thing but not
 * its later corrections.
 *
 * This hook is the single unit both screens now call, so the invariant is
 * tested where it lives rather than only through whichever screens happen to
 * exist today. A third caller gets the fix by construction.
 */
describe("usarCierreDeSesion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cerrar.mockResolvedValue(undefined);
  });

  it("revokes the session and returns to the login screen", async () => {
    const { result } = renderHook(() => usarCierreDeSesion());

    await result.current();

    expect(cerrar).toHaveBeenCalledTimes(1);
    expect(navegar).toHaveBeenCalledWith("/login", {
      replace: true,
      state: { motivo: "cierre_explicito" },
    });
  });

  /**
   * Task 21: `PaginaLogin` reads the reason from router state alone
   * (`motivoDesdeEstado`), never from `obtenerMotivoUltimoCierre()`, so the
   * confirmation exists only if this navigation carries it.
   *
   * It used to be a parameter, and the header left it empty — which is
   * exactly how the control almost everyone taps ended up landing on a
   * silent login screen while `PanelNoDisponible` confirmed the very same
   * action. Everyone who reaches this hook tapped "Cerrar sesión"; an expiry
   * arrives through `GuardiasDeRuta` carrying its own reason. So the reason
   * is unconditional here, and no caller can forget it.
   */
  it("carries the explicit-logout reason without being asked for one", async () => {
    const { result } = renderHook(() => usarCierreDeSesion());

    await result.current();

    expect(navegar).toHaveBeenCalledWith("/login", {
      replace: true,
      state: { motivo: "cierre_explicito" },
    });
  });

  /**
   * `toHaveBeenCalledWith` ignores undefined-valued properties, so a state
   * carrying `motivo: undefined` would satisfy the assertion above and still
   * leave `PaginaLogin` with nothing to show. Pinned structurally instead —
   * `toStrictEqual`, unlike `toEqual`, refuses an undefined-valued key.
   */
  it("carries a real reason, not an undefined-valued key", async () => {
    const { result } = renderHook(() => usarCierreDeSesion());

    await result.current();

    const [, opciones] = navegar.mock.calls[0] as [string, Record<string, unknown>];
    expect(opciones).toStrictEqual({ replace: true, state: { motivo: "cierre_explicito" } });
  });

  /**
   * `cerrarSesion` clears the in-memory session BEFORE anything that can
   * throw. What still reaches here is the local cleanup failing —
   * `localStorage.removeItem` raises a SecurityError when the browser blocks
   * storage — and by then the session is already gone, so staying put would
   * park someone on a screen backed by nothing.
   */
  it("leaves anyway when the local cleanup throws", async () => {
    cerrar.mockRejectedValue(new DOMException("bloqueado", "SecurityError"));
    const { result } = renderHook(() => usarCierreDeSesion());

    await result.current();

    expect(navegar).toHaveBeenCalledWith("/login", {
      replace: true,
      state: { motivo: "cierre_explicito" },
    });
  });

  /**
   * Both call sites discard the promise with `void`, and `void` does not
   * catch — it evaluates its operand and throws the value away, rejection
   * handler still unattached. Called exactly that way here, so the escape
   * this guards against is the real one: an `unhandledrejection` in the
   * browser, and a non-zero test-process exit with every assertion green.
   */
  it("keeps the failed cleanup from escaping as an unhandled rejection", async () => {
    cerrar.mockRejectedValue(new DOMException("bloqueado", "SecurityError"));
    const escapadas: unknown[] = [];
    const anotarEscapada = (razon: unknown): void => {
      escapadas.push(razon);
    };
    process.on("unhandledRejection", anotarEscapada);

    try {
      const { result } = renderHook(() => usarCierreDeSesion());

      void result.current();
      await new Promise((resolver) => setTimeout(resolver, 0));

      expect(escapadas).toEqual([]);
      expect(navegar).toHaveBeenCalledWith("/login", {
        replace: true,
        state: { motivo: "cierre_explicito" },
      });
    } finally {
      process.off("unhandledRejection", anotarEscapada);
    }
  });
});
