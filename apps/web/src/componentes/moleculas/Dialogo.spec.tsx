import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Dialogo } from "./Dialogo";

/**
 * Visibility is asserted through the native `open` state, not through
 * layout: the installed jsdom (30.0.1) implements HTMLDialogElement's
 * `open` property but NOT `showModal()`/`close()` (verified against its
 * real prototype — `['constructor', 'open']`), so the component's guarded
 * fallback (`open` attribute) is the path that actually runs here. Real
 * stacking, backdrop and focus trapping are the browser's own
 * (`<dialog>` + `showModal()`), exercised only in a real browser.
 */
describe("Dialogo", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function props(sobrescrituras: Partial<Parameters<typeof Dialogo>[0]> = {}) {
    return {
      abierto: true,
      titulo: "Anular el contrato",
      onCerrar: vi.fn(),
      children: <p>Contenido del diálogo</p>,
      ...sobrescrituras,
    };
  }

  it("opens as a modal dialog named by its title, with the children inside", () => {
    render(<Dialogo {...props()} />);

    const dialogo = screen.getByRole("dialog", { name: "Anular el contrato" });
    expect(dialogo).toHaveAttribute("open");
    expect(dialogo).toContainElement(screen.getByText("Contenido del diálogo"));
    expect(screen.getByRole("heading", { name: "Anular el contrato" })).toBeInTheDocument();
  });

  it("mirrors abierto onto the native element in both directions", () => {
    const { rerender, container } = render(<Dialogo {...props({ abierto: false })} />);

    const dialogo = container.querySelector("dialog");
    expect(dialogo).not.toBeNull();
    expect(dialogo?.open).toBe(false);

    rerender(<Dialogo {...props({ abierto: true })} />);
    expect(dialogo?.open).toBe(true);

    rerender(<Dialogo {...props({ abierto: false })} />);
    expect(dialogo?.open).toBe(false);
  });

  /**
   * A bare `close` event is never user intent: the browser fires it for
   * every `close()` call, including the component's own mirror/unmount
   * closes. Under StrictMode's mount-unmount-mount the unmount cleanup
   * closed the just-opened dialog and the queued `close` event then reset
   * the caller's state — the modal flashed and vanished (PR23 fix). Only
   * `cancel` (Esc) carries intent.
   */
  it("ignores the native close event — only cancel (Esc) reports through onCerrar", () => {
    const onCerrar = vi.fn();
    const { container } = render(<Dialogo {...props({ onCerrar })} />);

    const dialogo = container.querySelector("dialog");
    expect(dialogo).not.toBeNull();
    if (dialogo === null) return;
    fireEvent(dialogo, new Event("close"));

    expect(onCerrar).not.toHaveBeenCalled();
  });

  /**
   * Tailwind v4's Preflight resets `margin: 0` on `*`, which overrides the
   * user-agent `margin: auto` that centres a modal `<dialog>` in the top
   * layer — without `m-auto` the modal sits in the viewport's top-left
   * corner (PR23 fix).
   */
  it("restores the user-agent centring Preflight's margin reset removes", () => {
    const { container } = render(<Dialogo {...props()} />);

    expect(container.querySelector("dialog")?.className).toMatch(/\bm-auto\b/);
  });

  it("reports Esc — the native cancel event — through onCerrar", () => {
    const onCerrar = vi.fn();
    const { container } = render(<Dialogo {...props({ onCerrar })} />);

    const dialogo = container.querySelector("dialog");
    expect(dialogo).not.toBeNull();
    if (dialogo === null) return;
    fireEvent(dialogo, new Event("cancel"));

    expect(onCerrar).toHaveBeenCalled();
  });

  /**
   * The component guards `showModal`/`close` behind `typeof … ===
   * "function"` because the installed jsdom lacks both. This pins the
   * guarded branch explicitly — if a future jsdom grows the methods, this
   * test keeps the fallback covered rather than letting it rot untested.
   */
  it("degrades to the open attribute where showModal does not exist, instead of crashing", () => {
    const original = HTMLDialogElement.prototype.showModal;
    // @ts-expect-error — simulating a runtime without HTMLDialogElement.showModal
    HTMLDialogElement.prototype.showModal = undefined;
    try {
      const { container } = render(<Dialogo {...props()} />);
      expect(container.querySelector("dialog")?.open).toBe(true);
    } finally {
      HTMLDialogElement.prototype.showModal = original;
    }
  });
});
