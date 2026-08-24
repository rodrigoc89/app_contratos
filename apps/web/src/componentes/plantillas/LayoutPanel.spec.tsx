import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LayoutPanel } from "./LayoutPanel";

/**
 * design.md D4 — the office shell, sibling to `LayoutTecnico`, never a
 * modification of it. `[data-layout-panel]`/`[data-layout-panel-contenido]`
 * replace the retired `.layout-panel`/`.layout-panel__contenido` BEM hooks
 * (PR16) — the wrapper now states its 1280px content cap and 16px base
 * size as literal Tailwind utilities instead of a class `panel.css` styled.
 */
describe("LayoutPanel", () => {
  it("renders its children inside a main landmark", () => {
    render(
      <LayoutPanel>
        <p>Contenido del panel</p>
      </LayoutPanel>,
    );

    expect(screen.getByRole("main")).toHaveTextContent("Contenido del panel");
  });

  it("carries the layout-panel data hooks the redesigned shell exposes", () => {
    const { container } = render(
      <LayoutPanel>
        <p>Contenido</p>
      </LayoutPanel>,
    );

    expect(container.querySelector("[data-layout-panel]")).not.toBeNull();
    expect(container.querySelector("[data-layout-panel-contenido]")).not.toBeNull();
  });
});
