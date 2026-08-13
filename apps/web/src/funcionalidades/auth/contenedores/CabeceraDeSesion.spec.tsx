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

  it("revokes the session and returns to the login screen", async () => {
    cerrar.mockResolvedValue(undefined);
    render(<CabeceraDeSesion nombreUsuario="oficina" />);

    fireEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));

    await waitFor(() => expect(cerrar).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(navegar).toHaveBeenCalledWith("/login", { replace: true }));
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

    await waitFor(() => expect(navegar).toHaveBeenCalledWith("/login", { replace: true }));
  });
});
