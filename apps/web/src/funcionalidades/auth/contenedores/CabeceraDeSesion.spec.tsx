import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { cerrarSesion } from "../../../datos/sesion/sesion";
import { CabeceraDeSesion } from "./CabeceraDeSesion";

vi.mock("../../../datos/sesion/sesion", () => ({ cerrarSesion: vi.fn() }));
const cerrar = vi.mocked(cerrarSesion);

const navegar = vi.fn();
vi.mock("react-router-dom", async (original) => ({
  ...(await original<typeof import("react-router-dom")>()),
  useNavigate: () => navegar,
}));

/**
 * Until now the ONLY way to sign out of this app was the `PanelNoDisponible`
 * fallback screen — the one a role with no panel lands on. A técnico on the
 * tablet and an office user on the panel had none at all.
 *
 * That is worse than an inconvenience on a shared device: `cerrarSesion`
 * revokes the whole refresh-token family server-side AND clears the local
 * draft (DESIGN.md D4/D8), precisely because a tablet passes between
 * technicians and a customer's DNI must not outlive the visit that captured
 * it. A logout nobody can reach is that protection existing on paper only.
 */
describe("CabeceraDeSesion", () => {
  it("names who is signed in, so a shared device never hides it", () => {
    render(<CabeceraDeSesion nombreUsuario="oficina" />);

    expect(screen.getByText("oficina")).toBeInTheDocument();
  });

  it("offers a way out", () => {
    render(<CabeceraDeSesion nombreUsuario="oficina" />);

    expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeInTheDocument();
  });

  /**
   * D2, spec `brand-presentation` — "wordmark renders next to the existing
   * controls". Both `técnico` and office shells share this header, so this
   * is the one place the mark has to render for every authenticated screen.
   *
   * `getByText`'s default matcher reads only a node's OWN direct text-node
   * children ("IES.NET" lives in a nested `<span>`), so the full rendered
   * name is read from `.marca-producto`'s `textContent` instead.
   */
  it("shows the IES.NET Contratos wordmark, without displacing the username or the logout button", () => {
    const { container } = render(<CabeceraDeSesion nombreUsuario="oficina" />);

    expect(container.querySelector(".marca-producto")?.textContent).toBe("IES.NET Contratos");
    expect(screen.getByText("oficina")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeInTheDocument();
  });

  it("revokes the session and returns to the login screen", async () => {
    cerrar.mockResolvedValue(undefined);
    render(<CabeceraDeSesion nombreUsuario="oficina" />);

    fireEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));

    await waitFor(() => expect(cerrar).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(navegar).toHaveBeenCalledWith("/login", {
        replace: true,
        state: { motivo: "cierre_explicito" },
      }),
    );
  });

  /**
   * `cerrarSesion` clears local state BEFORE awaiting the request precisely
   * so a network failure cannot trap someone in a session they asked to
   * leave. The header must not undo that by staying put when the call
   * rejects.
   */
  it("still leaves when the server call fails", async () => {
    cerrar.mockRejectedValue(new Error("sin red"));
    render(<CabeceraDeSesion nombreUsuario="oficina" />);

    fireEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));

    await waitFor(() =>
      expect(navegar).toHaveBeenCalledWith("/login", {
        replace: true,
        state: { motivo: "cierre_explicito" },
      }),
    );
  });

  /**
   * Leaving anyway is only half the contract. The click handler discards the
   * promise with `void`, and `void` does not catch — it evaluates the operand
   * and throws the value away, rejection handler still unattached. So a
   * `try`/`finally` with no `catch` let "sin red" escape the component: in the
   * browser that is an `unhandledrejection` on every logout with the network
   * down, and here it is an error the test process exits 1 on while all 538
   * assertions stay green.
   *
   * Node reports an escaped rejection on the tick after the microtask queue
   * drains, so the listener stays attached one macrotask past the navigation.
   */
  it("keeps the failed revocation from escaping as an unhandled rejection", async () => {
    cerrar.mockRejectedValue(new Error("sin red"));
    const escapadas: unknown[] = [];
    const anotarEscapada = (razon: unknown): void => {
      escapadas.push(razon);
    };
    process.on("unhandledRejection", anotarEscapada);

    try {
      render(<CabeceraDeSesion nombreUsuario="oficina" />);

      fireEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));

      await waitFor(() =>
        expect(navegar).toHaveBeenCalledWith("/login", {
          replace: true,
          state: { motivo: "cierre_explicito" },
        }),
      );
      await new Promise((resolver) => setTimeout(resolver, 0));

      expect(escapadas).toEqual([]);
    } finally {
      process.off("unhandledRejection", anotarEscapada);
    }
  });
});
