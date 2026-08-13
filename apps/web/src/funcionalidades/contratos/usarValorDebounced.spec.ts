import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usarValorDebounced } from "./usarValorDebounced";

/**
 * D11/D15 — the input MUST stay instantly responsive: only the **key**
 * (the debounced value returned here) settles after a pause. `aplicarAhora`
 * is the flush the search box's `Enter` handler needs (R-3.7): it must not
 * wait out the remaining part of the timer.
 */
describe("usarValorDebounced", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the initial value immediately", () => {
    const { result } = renderHook(() => usarValorDebounced("", 300));

    expect(result.current[0]).toBe("");
  });

  it("does not update the debounced value before the delay elapses", () => {
    const { result, rerender } = renderHook(({ valor }) => usarValorDebounced(valor, 300), {
      initialProps: { valor: "" },
    });

    rerender({ valor: "perez" });
    act(() => {
      vi.advanceTimersByTime(299);
    });

    expect(result.current[0]).toBe("");
  });

  it("settles to the latest value once the delay elapses with no further changes", () => {
    const { result, rerender } = renderHook(({ valor }) => usarValorDebounced(valor, 300), {
      initialProps: { valor: "" },
    });

    rerender({ valor: "p" });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    rerender({ valor: "pe" });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    rerender({ valor: "perez" });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current[0]).toBe("perez");
  });

  it("aplicarAhora flushes to the current raw value immediately, without waiting out the timer", () => {
    const { result, rerender } = renderHook(({ valor }) => usarValorDebounced(valor, 300), {
      initialProps: { valor: "" },
    });

    rerender({ valor: "perez" });
    act(() => {
      result.current[1]();
    });

    expect(result.current[0]).toBe("perez");
  });
});
