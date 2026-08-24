import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/App";
import { RaizConActualizacion } from "./app/RaizConActualizacion";
import "./estilos/tema.css";

const contenedor = document.getElementById("app");

if (contenedor) {
  createRoot(contenedor).render(
    <StrictMode>
      <RaizConActualizacion>
        <App />
      </RaizConActualizacion>
    </StrictMode>,
  );
}
