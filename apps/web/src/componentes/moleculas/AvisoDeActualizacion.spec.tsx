import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AvisoDeActualizacion } from "./AvisoDeActualizacion";

/**
 * DESIGN.md D9 — "Outside a visit, the technician sees a discreet 'Hay una
 * versión nueva' affordance and taps to apply." Purely presentational:
 * `visible` and `onAplicar` are the only inputs, so `componentes/` stays
 * free of the data layer per D10's container/presentational split.
 */
describe("AvisoDeActualizacion", () => {
  it("renders nothing while no update is safe to show", () => {
    render(<AvisoDeActualizacion visible={false} onAplicar={() => {}} />);

    expect(screen.queryByText(/versión nueva/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows the discreet affordance once it is safe to apply", () => {
    render(<AvisoDeActualizacion visible={true} onAplicar={() => {}} />);

    expect(screen.getByText(/versión nueva/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Actualizar" })).toBeInTheDocument();
  });

  it("calls onAplicar exactly once when the technician taps Actualizar", async () => {
    const usuario = userEvent.setup();
    const onAplicar = vi.fn();
    render(<AvisoDeActualizacion visible={true} onAplicar={onAplicar} />);

    await usuario.click(screen.getByRole("button", { name: "Actualizar" }));

    expect(onAplicar).toHaveBeenCalledTimes(1);
  });
});
