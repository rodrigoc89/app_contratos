/**
 * The draft form's two steps, named once so the two organisms that render
 * them cannot drift into describing the same journey differently.
 */
export const PASOS_DEL_BORRADOR = ["Datos del cliente", "Equipos entregados"] as const;

interface PropiedadesIndicadorDePaso {
  readonly pasos: readonly string[];
  /** 1-based, the way it is spoken: "paso 1 de 2", never "paso 0". */
  readonly actual: number;
}

/**
 * Where the técnico is in the draft form, and how much is left.
 *
 * It exists because the form gave no answer to the second question. A
 * técnico is filling this in standing in someone's house with the customer
 * watching, and "how much longer is this going to take" is asked out loud.
 *
 * It deliberately describes only the two steps the draft form owns. Signing
 * and delivery are further along the journey but live in another container
 * with its own internal steps, so claiming a total that covers them would be
 * a number this component cannot honestly know.
 *
 * The current step is stated three ways — `aria-current`, the numeric "Paso
 * 1 de 2", and the visual treatment — because each fails somewhere the others
 * do not: colour is the first thing to go in direct sun, and it says nothing
 * at all to a screen reader.
 */
export function IndicadorDePaso({ pasos, actual }: PropiedadesIndicadorDePaso) {
  return (
    <nav className="indicador-de-paso" aria-label="Progreso del contrato">
      <p className="indicador-de-paso__resumen">
        Paso {actual} de {pasos.length}
      </p>
      <ol className="indicador-de-paso__lista">
        {pasos.map((nombre, indice) => {
          const numero = indice + 1;
          const esActual = numero === actual;
          const cumplido = numero < actual;

          return (
            <li
              key={nombre}
              className={[
                "indicador-de-paso__paso",
                esActual ? "indicador-de-paso__paso--actual" : "",
                cumplido ? "indicador-de-paso__paso--cumplido" : "",
              ]
                .filter((clase) => clase !== "")
                .join(" ")}
              {...(esActual ? { "aria-current": "step" as const } : {})}
            >
              <span className="indicador-de-paso__numero" aria-hidden="true">
                {numero}
              </span>
              <span className="indicador-de-paso__nombre">{nombre}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
