import { useEffect, useId, useRef, type ReactNode } from "react";

/**
 * design-system-migration PR21 — the shared modal, built on the NATIVE
 * `<dialog>` element and `showModal()`: focus trap, Esc-to-close,
 * `::backdrop` and focus return to the opener are the browser's own, so no
 * dialog library (D1 — `convencionesDeUtilidades.spec.ts` bans Radix) and
 * no hand-rolled focus management to get wrong.
 *
 * The element is the source of truth for "open": React mirrors `abierto`
 * onto it (`showModal()`/`close()`), and the native `cancel` event (Esc)
 * reports back through `onCerrar` so state follows the browser when the
 * user closes it without a button. `close` is deliberately NOT listened to:
 * the browser fires it for every `close()` call, including this component's
 * own mirror and unmount closes — under StrictMode's mount-unmount-mount the
 * unmount cleanup closed the just-opened dialog and the queued `close` event
 * then reset the caller's state, so the modal flashed and vanished (PR23).
 */
export interface PropiedadesDialogo {
  readonly abierto: boolean;
  readonly titulo: string;
  readonly onCerrar: () => void;
  readonly children: ReactNode;
}

/**
 * Sized in rem off the viewport WIDTH only — never a `vh`-bound height
 * (guards 17/19 reserve those for the legal-reading iframe/canvas): a modal
 * taller than the screen scrolls the page behind it, which the native
 * `showModal()` already prevents.
 *
 * `m-auto` restores the user-agent `margin: auto` that centres a modal
 * dialog in the top layer — Tailwind v4's Preflight resets `margin: 0` on
 * `*`, and without this the modal sat in the viewport's top-left corner
 * (PR23).
 */
const CLASE_DIALOGO =
  "m-auto w-[calc(100%-2rem)] max-w-[32rem] rounded-base border-2 border-borde bg-fondo p-6 backdrop:bg-texto/40";
const CLASE_TITULO = "m-0 mb-3 text-[1.125rem] font-bold";

/**
 * The installed jsdom (30.0.1) implements HTMLDialogElement's `open`
 * property but neither `showModal()` nor `close()`, so both calls are
 * guarded: where the methods are missing, the `open` attribute alone shows
 * and hides the dialog instead of crashing. The attribute path fires no
 * `close` event — callers close through `onCerrar` anyway, so nothing is
 * lost there.
 */
function abrirNativo(dialogo: HTMLDialogElement): void {
  if (typeof dialogo.showModal === "function") {
    dialogo.showModal();
  } else {
    dialogo.setAttribute("open", "");
  }
}

function cerrarNativo(dialogo: HTMLDialogElement): void {
  if (typeof dialogo.close === "function") {
    dialogo.close();
  } else {
    dialogo.removeAttribute("open");
  }
}

export function Dialogo({ abierto, titulo, onCerrar, children }: PropiedadesDialogo) {
  const referencia = useRef<HTMLDialogElement>(null);
  const idDeTitulo = useId();

  useEffect(() => {
    const dialogo = referencia.current;
    if (dialogo === null) {
      return;
    }
    if (abierto && !dialogo.open) {
      abrirNativo(dialogo);
    } else if (!abierto && dialogo.open) {
      cerrarNativo(dialogo);
    }
  }, [abierto]);

  // Closing before the node is removed is what lets the browser hand focus
  // back to the opener when the caller unmounts an open dialog.
  useEffect(() => {
    const dialogo = referencia.current;
    return () => {
      if (dialogo !== null && dialogo.open) {
        cerrarNativo(dialogo);
      }
    };
  }, []);

  useEffect(() => {
    const dialogo = referencia.current;
    if (dialogo === null) {
      return;
    }
    const notificarCancelacion = () => {
      onCerrar();
    };
    // No preventDefault on cancel: the default action (closing) is exactly
    // what Esc means here. By the time React re-renders with `abierto`
    // false the element is already closed, so the mirror effect is a no-op.
    dialogo.addEventListener("cancel", notificarCancelacion);
    return () => {
      dialogo.removeEventListener("cancel", notificarCancelacion);
    };
  }, [onCerrar]);

  return (
    <dialog ref={referencia} aria-labelledby={idDeTitulo} className={CLASE_DIALOGO}>
      <h2 id={idDeTitulo} className={CLASE_TITULO}>
        {titulo}
      </h2>
      {children}
    </dialog>
  );
}
