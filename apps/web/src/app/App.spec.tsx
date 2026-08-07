import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "./App";

describe("App", () => {
  it("mounts the real route tree behind the shared providers and redirects an unauthenticated visit to login", () => {
    // PR2's placeholder root route ("Visita en curso" with no guard) was
    // deliberately replaced in PR5 by the real técnico-only tree (DESIGN.md
    // D4, D10) — `rutas/rutas.spec.tsx` covers the guard behaviour itself
    // in detail; this only proves `App` wires the real tree, not the
    // skeleton, into the shared providers.
    render(<App />);

    expect(screen.getByLabelText("Usuario")).toBeInTheDocument();
  });
});
