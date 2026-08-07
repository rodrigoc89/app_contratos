import { RouterProvider } from "react-router-dom";

import { enrutador } from "../rutas/enrutador";
import { Providers } from "./providers";

export function App() {
  return (
    <Providers>
      <RouterProvider router={enrutador} />
    </Providers>
  );
}
