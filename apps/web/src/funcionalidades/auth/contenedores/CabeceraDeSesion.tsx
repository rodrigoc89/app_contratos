import { Power } from "lucide-react";

import { Boton } from "../../../componentes/atomos/Boton";
import { MarcaProducto } from "../../../componentes/atomos/MarcaProducto";
import { usarCierreDeSesion } from "../usarCierreDeSesion";
import { usarSesionActual } from "../usarSesionActual";

/**
 * Who is signed in, and the way out.
 *
 * Until this existed the only logout control in the app was on
 * `PanelNoDisponible` — the screen a role with no panel lands on — so a
 * técnico on the tablet and an office user on the panel had none at all.
 *
 * On a shared device that is not a convenience. `cerrarSesion` revokes the
 * whole refresh-token family server-side and clears the local draft
 * (DESIGN.md D4/D8), because a tablet passes between technicians and a
 * customer's DNI must not outlive the visit that captured it. A logout
 * nobody can reach is that protection existing on paper only.
 *
 * The username is shown for the same reason: on a device several people use,
 * "whose session is this?" has to be answerable without clicking anything.
 *
 * design-system-migration PR8 — visual redesign, closing the two-row wrap
 * `geometriaHandheld.ts` measured at 390px (110-117px técnico, 98-105px
 * oficina against a 72px single-row budget; PR5's regression witness).
 * The old `.cabecera-sesion`/`.cabecera-sesion__usuario` selectors are
 * dropped rather than kept as inert hooks: `estilos/organismos.css`'s rules
 * for them are unlayered, hand-authored CSS, and Tailwind wraps its own
 * output in `@layer` — an unlayered rule always outranks a layered one of
 * equal specificity regardless of source order, so keeping either class
 * name would have silently reinstated the old `flex-wrap: wrap` this
 * redesign exists to remove. `[data-cabecera-de-sesion]` replaces
 * `.cabecera-sesion` as the harness's hook (`geometriaHandheld.ts`).
 *
 * `flex` with no `flex-wrap` (Tailwind's — and CSS's — default is `nowrap`)
 * is what makes the row structurally unable to wrap; the username is the
 * one element that shrinks (`min-w-0 flex-1`) instead, since it is the one
 * string here without a fixed identity to protect. It uses `overflow-x-auto`
 * rather than Tailwind's usual ellipsis shorthand, which resolves to a
 * banned overflow value once compiled — caught, not assumed, by running
 * `test:compilado` against this exact redesign — so a name too long for its
 * box scrolls inside its own local scrolling context instead, never
 * widening the document. `title={nombre}` still exposes the full value on
 * hover regardless.
 *
 * The way out is a `Power` glyph rather than the words "Cerrar sesión", at
 * the user's request — it also buys back the width the username needs on a
 * 360px screen. An icon carries no accessible name of its own, so the name
 * moves to `aria-label` and the glyph is `aria-hidden`: a screen reader
 * still announces "Cerrar sesión, botón", and `title` gives a pointer user
 * the same words on hover.
 *
 * The existing `getByRole("button", { name: "Cerrar sesión" })` queries do
 * NOT guard that label, which was checked rather than assumed: deleting
 * `aria-label` here left all 691 web specs passing, because `title` also
 * satisfies the accessible-name computation those queries use. A suite that
 * looks like it protects the name while resting on the weaker attribute is
 * the failure this project keeps finding, so `CabeceraDeSesion.spec.tsx`
 * asserts the `aria-label` attribute itself and fails without it. The touch
 * floor is
 * untouched: `min-h-toque min-w-toque` still applies and `px-0` only
 * removes the horizontal padding the text needed, leaving a 48x48 square
 * for a gloved thumb. The panel's previous 0.875rem header shrink
 * (`panel.css:170`, a direct declaration on the old BEM classes) has no
 * replacement here: it depended on selectors this redesign removes, and a
 * real per-shell exemption axis is guard 8's job (PR9, design.md D4), not
 * this PR's — disclosed, not silently dropped.
 */
export function CabeceraDeSesion({ nombreUsuario }: { readonly nombreUsuario?: string } = {}) {
  const sesion = usarSesionActual();
  const nombre = nombreUsuario ?? sesion?.usuario.nombreUsuario ?? "";
  // `usarCierreDeSesion` owns the leaving AND the confirmation the login
  // screen shows on arrival — the same unit `PanelNoDisponible` calls, so
  // neither the rejection handling PR #61 added here nor that message can go
  // missing from one control and not the other again.
  const salir = usarCierreDeSesion();

  return (
    <header
      data-cabecera-de-sesion
      className="sticky top-0 z-10 flex items-center gap-1 border-b border-borde-suave bg-fondo px-2 py-2"
    >
      <div className="shrink-0">
        <MarcaProducto />
      </div>
      <span className="min-w-0 flex-1 overflow-x-auto text-right font-semibold text-texto-suave" title={nombre}>
        {nombre}
      </span>
      <Boton
        type="button"
        variante="fantasma"
        className="shrink-0 px-0"
        aria-label="Cerrar sesión"
        title="Cerrar sesión"
        onClick={() => void salir()}
      >
        <Power size={20} aria-hidden="true" />
      </Boton>
    </header>
  );
}
