import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/App";

const contenedor = document.getElementById("app");

if (contenedor) {
  createRoot(contenedor).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
