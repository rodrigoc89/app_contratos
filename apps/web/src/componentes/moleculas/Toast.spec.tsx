import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Toast } from "./Toast";

/**
 * PR26 — the shared confirmation surface for exactly three transient
 * messages (design.md: "Toast" category). Bottom-anchored, high-contrast,
 * auto-dismisses around 5s AND is dismissible by tap. Unlike
 * `[role="alert"]`, nothing breaks if a toast is missed — that is what
 * makes auto-dismiss safe here and nowhere else.
 */
describe("Toast", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("announces the message via role=status — a toast without a live region is invisible to a screen reader", () => {
    render(<Toast mensaje="Borrador creado. ID: c1" onDescartar={() => {}} />);

    expect(screen.getByRole("status")).toHaveTextContent("Borrador creado. ID: c1");
  });

  it("auto-dismisses on its own after ~5 seconds", () => {
    vi.useFakeTimers();
    const alDescartar = vi.fn();
    render(<Toast mensaje="Borrador creado. ID: c1" onDescartar={alDescartar} />);

    vi.advanceTimersByTime(4_999);
    expect(alDescartar).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(alDescartar).toHaveBeenCalledTimes(1);
  });

  it("is dismissible by tap, before the auto-dismiss timer fires", () => {
    const alDescartar = vi.fn();
    render(<Toast mensaje="Borrador creado. ID: c1" onDescartar={alDescartar} />);

    fireEvent.click(screen.getByRole("button", { name: "Cerrar aviso" }));

    expect(alDescartar).toHaveBeenCalledTimes(1);
  });
});
