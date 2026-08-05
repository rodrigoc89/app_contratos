import type { Reloj } from "../application/ports/Reloj";

/**
 * The real server clock.
 *
 * A thin wrapper, deliberately: `firmar()` and the repositories that need
 * "today" (`PrismaPlantillaRepository.vigente`, event ordering on save) must
 * depend on the `Reloj` port, never call `new Date()` directly, so a test can
 * substitute a fixed instant instead of racing the real clock.
 */
export class RelojDelSistema implements Reloj {
  ahora(): Date {
    return new Date();
  }
}
