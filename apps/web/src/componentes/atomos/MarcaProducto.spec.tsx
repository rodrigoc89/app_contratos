import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MarcaProducto } from "./MarcaProducto";

/**
 * D1/D2 — the wordmark is live text, not an image or a heading. Two markup
 * constraints are non-negotiable and each gets its own assertion here:
 *
 * 1. Never an `<h1>` — `PaginaLogin.spec.tsx:242-251` uses
 *    `getByRole("heading", {level: 1})`, which throws on two matches.
 * 2. Never a link — `convencionesDeEstilos.spec.ts`'s link-floor scan
 *    demands both touch floors of every `<a>`/`<Link>` carrying a
 *    `className`, and the wordmark is a name, not a control.
 */
describe("MarcaProducto", () => {
  it("names the product", () => {
    // `getByText`'s default matcher reads only a node's OWN direct text-node
    // children (`IES.NET` lives in a nested <span>), so the full rendered
    // name is read from the element's `textContent` instead — the same
    // concatenation an accessible-name computation performs.
    const { container } = render(<MarcaProducto />);

    const marca = container.querySelector(".marca-producto");
    expect(marca).not.toBeNull();
    expect(marca?.textContent).toBe("IES.NET Contratos");
  });

  it("is never a heading", () => {
    render(<MarcaProducto />);

    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });

  it("is never a link", () => {
    render(<MarcaProducto />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
