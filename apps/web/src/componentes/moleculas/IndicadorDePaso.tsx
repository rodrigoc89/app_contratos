import { cva } from "class-variance-authority";

/**
 * The draft form's two steps, named once so the two organisms that render
 * them cannot drift into describing the same journey differently.
 */
export const PASOS_DEL_BORRADOR = ["Datos del cliente", "Equipos entregados"] as const;

/**
 * design-system-migration PR11 — visual redesign, `estadoPaso` variant keyed
 * the same way the retired BEM modifiers were: a step is filled (`actual`),
 * outlined (`cumplido`), or neutral (`pendiente`), never two of these at
 * once. Fill, not tint, keeps the live step unmistakable at arm's length in
 * direct sun — the same reasoning the retired CSS comment recorded.
 */
const pasoDelIndicador = cva("flex items-center gap-2 rounded-base border-2 px-3 py-2", {
  variants: {
    estadoPaso: {
      pendiente: "border-borde-suave text-texto-suave",
      actual: "border-primario bg-primario font-bold text-fondo",
      cumplido: "border-primario text-primario",
    },
  },
});

const numeroDelPaso = cva("inline-flex size-6 items-center justify-center rounded-full font-bold", {
  variants: {
    estadoPaso: {
      pendiente: "bg-borde-suave text-texto-suave",
      actual: "bg-fondo text-primario",
      cumplido: "bg-primario text-fondo",
    },
  },
});

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
    <nav className="mb-4" aria-label="Progreso del contrato">
      <p className="mb-2 font-bold uppercase tracking-wide text-texto-suave">
        Paso {actual} de {pasos.length}
      </p>
      <ol className="m-0 flex list-none flex-wrap gap-2 p-0">
        {pasos.map((nombre, indice) => {
          const numero = indice + 1;
          const esActual = numero === actual;
          const cumplido = numero < actual;
          const estadoPaso = esActual ? "actual" : cumplido ? "cumplido" : "pendiente";

          return (
            <li
              key={nombre}
              className={pasoDelIndicador({ estadoPaso })}
              {...(esActual ? { "aria-current": "step" as const } : {})}
            >
              <span className={numeroDelPaso({ estadoPaso })} aria-hidden="true">
                {numero}
              </span>
              <span>{nombre}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
