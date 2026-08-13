import type { DatosDocumentoDisponible } from "@contratos/esquemas";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { Boton } from "../../../componentes/atomos/Boton";
import { Spinner } from "../../../componentes/atomos/Spinner";
import { AccionesDeContrato } from "../../../componentes/organismos/AccionesDeContrato";
import { DetalleDeContrato } from "../../../componentes/organismos/DetalleDeContrato";
import { ErrorDeApi } from "../../../datos/clienteHttp";
import { descargarDocumento } from "../../../datos/descargaDeArchivo";
import { mensajeDeError } from "../../../errores/mensajeDeError";
import { usarContrato } from "../usarContrato";
import { usarTransicionDeContrato } from "../usarTransicionDeContrato";

/**
 * The office contract detail. Owns the query and the download, and hands
 * `DetalleDeContrato` nothing but data and a callback — the presentational
 * half may not import `datos/` (`convencionDeCapas.spec.ts`).
 *
 * The download cannot be a plain `<a href>`: the endpoint is authenticated
 * and a browser navigation sends no `Authorization` header, so it would
 * answer 401. It goes through `descargarDocumento`, which fetches the PDF
 * with the bearer token and hands the bytes to the browser as an object URL
 * — the same seam, and the same paired `revokeObjectURL`, the técnico's
 * delivery flow uses.
 */
export function PaginaDetalleContrato() {
  const { id = "" } = useParams<{ id: string }>();
  const { data, isLoading, isError, error, refetch } = usarContrato(id);
  const [descargando, establecerDescargando] =
    useState<DatosDocumentoDisponible["documento"] | undefined>(undefined);
  const [errorDeDescarga, establecerErrorDeDescarga] = useState<string | null>(null);
  const transicion = usarTransicionDeContrato(id);

  async function manejarDescarga(documento: DatosDocumentoDisponible): Promise<void> {
    establecerDescargando(documento.documento);
    establecerErrorDeDescarga(null);
    try {
      await descargarDocumento(documento);
    } catch (motivo) {
      // A failed download never implies the contract is unsigned — it is
      // already sealed and legally complete. The message says only that the
      // file could not be fetched, and the action stays available.
      establecerErrorDeDescarga(
        motivo instanceof ErrorDeApi
          ? mensajeDeError(motivo).mensaje
          : "No se pudo descargar el documento. Podés intentar de nuevo.",
      );
    } finally {
      establecerDescargando(undefined);
    }
  }

  return (
    <div className="pagina-detalle-contrato">
      <p className="pagina-detalle-contrato__volver">
        <Link to="/contratos">← Volver al listado</Link>
      </p>

      {isLoading && (
        <div role="status" className="progreso">
          <span aria-hidden="true">
            <Spinner etiqueta="Cargando el contrato" />
          </span>
          Cargando el contrato…
        </div>
      )}

      {isError && (
        <div role="alert">
          <p>
            {error instanceof ErrorDeApi
              ? mensajeDeError(error).mensaje
              : "No se pudo cargar el contrato."}
          </p>
          <Boton type="button" onClick={() => void refetch()}>
            Reintentar
          </Boton>
        </div>
      )}

      {errorDeDescarga !== null && <p role="alert">{errorDeDescarga}</p>}

      {/*
        A failed transition is reported here rather than inside the actions,
        and never as "the contract might not be in the state you think" — the
        server's own message is shown, because a 409 already says exactly
        which state it refused and why.
      */}
      {transicion.isError && (
        <p role="alert">
          {transicion.error instanceof ErrorDeApi
            ? mensajeDeError(transicion.error).mensaje
            : "No se pudo registrar el cambio. Podés intentar de nuevo."}
        </p>
      )}

      {!isLoading && !isError && data !== undefined && (
        <>
          <DetalleDeContrato
            contrato={data}
            onDescargar={(documento) => void manejarDescarga(documento)}
            descargando={descargando}
          />
          <AccionesDeContrato
            contrato={data}
            enCurso={transicion.isPending}
            onDarDeBaja={(datos) => transicion.mutate({ tipo: "baja", ...datos })}
            onAnular={(datos) => transicion.mutate({ tipo: "anulacion", ...datos })}
            onRegistrarRestitucion={(datos) =>
              transicion.mutate({ tipo: "restitucion", ...datos })
            }
          />
        </>
      )}
    </div>
  );
}
