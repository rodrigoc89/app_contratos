import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "./App";

describe("App", () => {
  it("mounts the route tree behind the shared providers and renders the root route", () => {
    render(<App />);

    expect(screen.getByText("Visita en curso")).toBeInTheDocument();
  });
});
