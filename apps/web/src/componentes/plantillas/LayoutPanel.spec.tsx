import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LayoutPanel } from "./LayoutPanel";

/**
 * DESIGN.md D13 — the office shell, sibling to `LayoutTablet`, never a
 * modification of it. `.layout-panel` is the class `panel.css`'s
 * `--fuente-base: 16px` rebind and the 1280px content cap both hang off.
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

  it("carries the layout-panel classes panel.css styles", () => {
    const { container } = render(
      <LayoutPanel>
        <p>Contenido</p>
      </LayoutPanel>,
    );

    expect(container.querySelector(".layout-panel")).not.toBeNull();
    expect(container.querySelector(".layout-panel__contenido")).not.toBeNull();
  });
});
