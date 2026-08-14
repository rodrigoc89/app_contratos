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
    expect(navegar).toHaveBeenCalledWith("/login", { replace: true });
  });

  /**
   * Task 21: `PaginaLogin` reads the reason from router state alone
   * (`motivoDesdeEstado`), never from `obtenerMotivoUltimoCierre()`, so the
   * confirmation message exists only if the caller carries it here.
   */
  it("carries the logout reason to the login screen when one is given", async () => {
    const { result } = renderHook(() => usarCierreDeSesion("cierre_explicito"));

    await result.current();

    expect(navegar).toHaveBeenCalledWith("/login", {
      replace: true,
      state: { motivo: "cierre_explicito" },
    });
  });

  /**
   * The header deliberately passes no reason, and its own spec pins the
   * navigation options exactly. Setting `state: undefined` instead of
   * omitting the key would slip past `toHaveBeenCalledWith` — which ignores
   * undefined-valued properties — so the key's absence is asserted directly.
   */
  it("omits the state entirely when no reason is given", async () => {
    const { result } = renderHook(() => usarCierreDeSesion());

    await result.current();

    const [, opciones] = navegar.mock.calls[0] as [string, Record<string, unknown>];
    expect(Object.keys(opciones)).toEqual(["replace"]);
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

    expect(navegar).toHaveBeenCalledWith("/login", { replace: true });
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
      expect(navegar).toHaveBeenCalledWith("/login", { replace: true });
    } finally {
      process.off("unhandledRejection", anotarEscapada);
    }
  });
});
