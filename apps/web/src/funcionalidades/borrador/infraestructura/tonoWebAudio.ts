import type { TonoDeConfirmacion } from "../logica/tonoDeConfirmacion";

const FRECUENCIA_HZ = 880;
const DURACION_S = 0.25;
const GANANCIA_PICO = 0.15;
const GANANCIA_SUELO = 0.0001;

interface FabricaAudioContext {
  new (): AudioContext;
}

function fabricaDisponible(): FabricaAudioContext | undefined {
  const globalConAudio = window as unknown as {
    AudioContext?: FabricaAudioContext;
    webkitAudioContext?: FabricaAudioContext;
  };
  return globalConAudio.AudioContext ?? globalConAudio.webkitAudioContext;
}

// Lazy singleton — one AudioContext for the app's lifetime, reused across
// every `reproducir()` call. `undefined` means "not looked up yet"; `null`
// means "looked up once and unavailable/failed", so a browser without
// WebAudio (or one whose construction throws) is not retried on every tap.
let contexto: AudioContext | null | undefined;

function obtenerContexto(): AudioContext | null {
  if (contexto !== undefined) {
    return contexto;
  }
  const Fabrica = fabricaDisponible();
  if (Fabrica === undefined) {
    contexto = null;
    return null;
  }
  try {
    contexto = new Fabrica();
  } catch {
    contexto = null;
  }
  return contexto;
}

function tocar(ctx: AudioContext): void {
  const oscilador = ctx.createOscillator();
  const ganancia = ctx.createGain();
  oscilador.type = "sine";
  oscilador.frequency.value = FRECUENCIA_HZ;
  ganancia.gain.setValueAtTime(GANANCIA_SUELO, ctx.currentTime);
  ganancia.gain.exponentialRampToValueAtTime(GANANCIA_PICO, ctx.currentTime + 0.02);
  ganancia.gain.exponentialRampToValueAtTime(GANANCIA_SUELO, ctx.currentTime + DURACION_S);
  oscilador.connect(ganancia);
  ganancia.connect(ctx.destination);
  oscilador.start();
  oscilador.stop(ctx.currentTime + DURACION_S + 0.05);
}

/**
 * DESIGN — the real `TonoDeConfirmacion` (design.md "The tone"). A short,
 * quiet oscillator beep, generated with WebAudio rather than shipped as an
 * audio file: nothing added to the bundle, works offline, no binary asset
 * in a repository whose only binaries are signed PDFs. One `AudioContext`
 * is created lazily and reused; browsers that suspend it until a user
 * gesture need `resume()` first — draft creation always follows a tap, but
 * resume can still be refused.
 *
 * Every failure mode is swallowed here, never re-thrown or left as an
 * unhandled rejection: no AudioContext at all, a synchronous construction
 * error, and a rejected `resume()`. A blocked or failing tone must never
 * break or delay the flow it only ever supplements — the toast is the
 * primary confirmation (design.md).
 */
export const tonoWebAudio: TonoDeConfirmacion = {
  reproducir(): void {
    try {
      const ctx = obtenerContexto();
      if (ctx === null) {
        return;
      }
      const listo = ctx.state === "suspended" ? ctx.resume() : Promise.resolve();
      listo.then(() => tocar(ctx)).catch(() => {
        // Swallowed by contract — see the class doc above.
      });
    } catch {
      // Swallowed by contract — see the class doc above.
    }
  },
};
