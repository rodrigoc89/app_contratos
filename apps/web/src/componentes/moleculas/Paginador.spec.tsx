import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Paginador } from "./Paginador";

/**
 * R-3.9 — pagination MUST always tell the operator where they are and MUST
 * NOT offer a control that does nothing.
 */
describe("Paginador", () => {
  it("disables the previous control on the first page and enables next", () => {
    render(<Paginador pagina={1} total={25} tamanoPagina={20} onCambiarPagina={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Página anterior" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Página siguiente" })).toBeEnabled();
  });

  it("disables the next control on the last page and enables previous", () => {
    render(<Paginador pagina={2} total={25} tamanoPagina={20} onCambiarPagina={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Página siguiente" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Página anterior" })).toBeEnabled();
  });

  it("offers no enabled navigation when everything fits on one page", () => {
    render(<Paginador pagina={1} total={5} tamanoPagina={20} onCambiarPagina={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Página anterior" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Página siguiente" })).toBeDisabled();
  });

  it("renders nothing at all for zero results", () => {
    const { container } = render(
      <Paginador pagina={1} total={0} tamanoPagina={20} onCambiarPagina={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("marks the current page programmatically with aria-current", () => {
    render(<Paginador pagina={3} total={140} tamanoPagina={20} onCambiarPagina={vi.fn()} />);

    expect(screen.getByRole("button", { name: "3" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "4" })).not.toHaveAttribute("aria-current");
  });

  it("keeps previous, next and the current-page indicator all present at once", () => {
    render(<Paginador pagina={3} total={140} tamanoPagina={20} onCambiarPagina={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Página anterior" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Página siguiente" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "3" })).toHaveAttribute("aria-current", "page");
  });

  it("calls onCambiarPagina with the previous page number", () => {
    const onCambiarPagina = vi.fn();
    render(<Paginador pagina={2} total={25} tamanoPagina={20} onCambiarPagina={onCambiarPagina} />);

    fireEvent.click(screen.getByRole("button", { name: "Página anterior" }));

    expect(onCambiarPagina).toHaveBeenCalledWith(1);
  });

  it("calls onCambiarPagina with the next page number", () => {
    const onCambiarPagina = vi.fn();
    render(<Paginador pagina={1} total={25} tamanoPagina={20} onCambiarPagina={onCambiarPagina} />);

    fireEvent.click(screen.getByRole("button", { name: "Página siguiente" }));

    expect(onCambiarPagina).toHaveBeenCalledWith(2);
  });

  it("calls onCambiarPagina with a directly clicked page number", () => {
    const onCambiarPagina = vi.fn();
    render(<Paginador pagina={1} total={140} tamanoPagina={20} onCambiarPagina={onCambiarPagina} />);

    fireEvent.click(screen.getByRole("button", { name: "5" }));

    expect(onCambiarPagina).toHaveBeenCalledWith(5);
  });
});
