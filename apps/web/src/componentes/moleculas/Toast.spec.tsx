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

  it("announces the message via role=status — a toast without a live region goes unnoticed by a screen reader", () => {
    render(<Toast mensaje="Borrador creado. ID: c1" onDescartar={() => {}} />);

    expect(screen.getByRole("status")).toHaveTextContent("Borrador creado. ID: c1");
  });

  /**
   * PR20 review — anchored to the TOP of the viewport, never the bottom.
   * Bottom-anchored, the 5s confirmation sat exactly on the primary action
   * of every wizard step ("Continuar"/submit lives at the bottom of a short
   * handheld viewport — the PR13 harness had to dismiss it to tap the
   * button). Covering the header for 5s is the deliberate tradeoff.
   */
  it("anchors to the top of the viewport so it never covers the bottom primary action", () => {
    render(<Toast mensaje="Borrador creado. ID: c1" onDescartar={() => {}} />);

    const toast = screen.getByRole("status");
    expect(toast.className).toContain("top-4");
    expect(toast.className).not.toContain("bottom-4");
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

  /**
   * The two halves of the ref's contract, and the reason it is a ref at all.
   *
   * Callers render `<Toast onDescartar={() => setAviso(null)} />` inline, so
   * the prop is a NEW function on every parent render. The component has to
   * satisfy both of these at once, and the obvious implementation of either
   * one breaks the other:
   *
   *   - an effect with `[onDescartar]` in its deps keeps the callback fresh
   *     and restarts the 5s window on every parent render, so a chatty parent
   *     produces a toast that never dismisses itself;
   *   - an effect with `[]` deps and no ref keeps the one window and captures
   *     the FIRST closure forever, so dismissal runs against stale state.
   *
   * The ref is what lets a mount-only timer read the current callback. These
   * tests pin the observable behaviour, not the mechanism, so the ref may be
   * written wherever React allows it — but it may not stop being a ref.
   */
  it("dismisses through the CURRENT onDescartar after the prop changes, never the closure it mounted with", () => {
    vi.useFakeTimers();
    const primero = vi.fn();
    const segundo = vi.fn();
    const { rerender } = render(<Toast mensaje="Borrador creado. ID: c1" onDescartar={primero} />);

    rerender(<Toast mensaje="Borrador creado. ID: c1" onDescartar={segundo} />);
    vi.advanceTimersByTime(5_000);

    expect(primero).not.toHaveBeenCalled();
    expect(segundo).toHaveBeenCalledTimes(1);
  });

  it("owns ONE 5s window from when it appeared — a re-render mid-window must not restart it", () => {
    vi.useFakeTimers();
    const primero = vi.fn();
    const segundo = vi.fn();
    const { rerender } = render(<Toast mensaje="Borrador creado. ID: c1" onDescartar={primero} />);

    vi.advanceTimersByTime(4_000);
    rerender(<Toast mensaje="Borrador creado. ID: c1" onDescartar={segundo} />);
    // Still the original window: 1s of it is left, not a fresh 5s.
    vi.advanceTimersByTime(1_000);

    expect(segundo).toHaveBeenCalledTimes(1);
  });

  it("is dismissible by tap, before the auto-dismiss timer fires", () => {
    const alDescartar = vi.fn();
    render(<Toast mensaje="Borrador creado. ID: c1" onDescartar={alDescartar} />);

    fireEvent.click(screen.getByRole("button", { name: "Cerrar aviso" }));

    expect(alDescartar).toHaveBeenCalledTimes(1);
  });
});
