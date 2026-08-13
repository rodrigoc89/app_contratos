import { useEffect, useRef, useState } from "react";

/**
 * DESIGN.md D11/D15 — debounces the **key**, not the request, and keeps the
 * input itself instantly responsive: the caller renders the raw value it
 * controls, and only reads the tuple's first element for the query key.
 *
 * Returns `[valorDebounced, aplicarAhora]` rather than the value alone
 * (revision 2 of the design): `Enter` in the search box (R-3.7) must search
 * *immediately*, bypassing the pending timer, which a value-only hook could
 * not express.
 */
export function usarValorDebounced(valor: string, retrasoMs: number): [string, () => void] {
  const [valorDebounced, establecerValorDebounced] = useState(valor);

  // Read synchronously by `aplicarAhora`, which must flush to whatever was
  // typed most recently even if it fires between renders.
  const valorActualRef = useRef(valor);
  valorActualRef.current = valor;

  useEffect(() => {
    const temporizador = setTimeout(() => {
      establecerValorDebounced(valor);
    }, retrasoMs);
    return () => clearTimeout(temporizador);
  }, [valor, retrasoMs]);

  function aplicarAhora(): void {
    establecerValorDebounced(valorActualRef.current);
  }

  return [valorDebounced, aplicarAhora];
}
