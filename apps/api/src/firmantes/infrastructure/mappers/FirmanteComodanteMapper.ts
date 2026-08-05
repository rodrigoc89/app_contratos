import { FirmanteComodante } from "../../domain/FirmanteComodante";

/** The `firmantes_comodante` row, as Prisma hands it back on a read. */
export interface FilaFirmanteComodante {
  id: string;
  version: string;
  nombreCompleto: string;
  dni: string;
  imagenFirmaPng: string;
}

export function firmanteComodanteDesdeFila(
  fila: FilaFirmanteComodante,
): FirmanteComodante {
  return FirmanteComodante.crear({
    id: fila.id,
    version: fila.version,
    nombreCompleto: fila.nombreCompleto,
    dni: fila.dni,
    imagenFirmaPng: fila.imagenFirmaPng,
  });
}
