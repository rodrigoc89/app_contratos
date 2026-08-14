import { act } from "@testing-library/react";

/**
 * Flushes every already-resolved promise and the React work it schedules,
 * using zero wall-clock time. This is the tool to reach for whenever a test
 * has fake timers installed and still needs to wait for a component to settle.
 *
 * WHY THIS EXISTS — the race it removes
 * ------------------------------------
 * `vi.waitFor` (and RTL's `waitFor`/`findBy*`) are wall-clock tools. In
 * Vitest 3 `vi.waitFor` grabs the ORIGINAL timers via `getSafeTimers()`, so
 * neither its 50 ms polling interval nor its 1000 ms budget is affected by
 * `vi.useFakeTimers()`. Under fake timers that leaves a test with two
 * independent clocks:
 *
 *   1. A real one, invisible in the test body, that quietly imposes a 1000 ms
 *      deadline on a machine the test does not control. Measured on a loaded
 *      12-core box, the signing-confirmation wait consumed 74–90 ms of that
 *      budget; the same contention was simultaneously blowing OTHER tests'
 *      5000 ms limits, so the headroom is real but not reliable. That is the
 *      textbook shape of a flaky test: it passes alone and fails in CI, and
 *      raising the budget only makes the failure rarer and more confusing.
 *   2. A fake one that `vi.waitFor` silently ADVANCES — it calls
 *      `vi.advanceTimersByTime(interval)` on every poll while fake timers are
 *      active. So the very clock the test installed in order to control a
 *      component's timeout is being moved by an unknown, load-dependent
 *      number of 50 ms steps before the test gets to drive it itself.
 *
 * Neither problem exists here. Nothing in this helper reads a clock: each
 * iteration of `await act(async () => {})` crosses exactly one macrotask
 * boundary, which drains the whole pending microtask queue and then flushes
 * React's act queue. The number of boundaries crossed is therefore identical
 * on an idle laptop and on a starved CI runner — which is what "deterministic"
 * means. Timer-driven behaviour is then driven explicitly, and only
 * explicitly, with `act(() => vi.advanceTimersByTime(...))`.
 *
 * The bound is a fixed count of flushes rather than a "keep going until quiet"
 * loop on purpose: a settle-based loop reintroduces a dependency on how fast
 * the machine produces work. Four boundaries cover the deepest chain in this
 * app (submit → queue flush → HTTP response → `Response.json()` → state), and
 * a chain deeper than that should fail loudly and identically everywhere
 * rather than pass on fast machines only.
 */
const LIMITES_DE_MACROTAREA = 4;

export async function vaciarTrabajoPendiente(): Promise<void> {
  for (let i = 0; i < LIMITES_DE_MACROTAREA; i += 1) {
    // Sequential on purpose: each flush must finish before the next begins,
    // because it is the previous one that produces the work the next drains.
    await act(async () => {});
  }
}
