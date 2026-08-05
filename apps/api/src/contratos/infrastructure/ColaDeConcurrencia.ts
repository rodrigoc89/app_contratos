/**
 * Bounds how many tasks run at once, queueing the rest in arrival order.
 *
 * Extracted out of `GeneradorDeDocumentosPuppeteer` because it is a generic
 * concurrency primitive with nothing PDF-specific about it, and testing the
 * queueing behaviour on its own is far simpler than doing it through a fake
 * browser.
 */
export class ColaDeConcurrencia {
  private activos = 0;
  private readonly pendientes: Array<() => void> = [];

  constructor(private readonly maximo: number) {
    if (!Number.isInteger(maximo) || maximo < 1) {
      throw new Error(
        `La concurrencia máxima tiene que ser un entero mayor o igual a 1 (recibió ${maximo}).`,
      );
    }
  }

  async ejecutar<T>(tarea: () => Promise<T>): Promise<T> {
    await this.adquirir();

    try {
      return await tarea();
    } finally {
      this.liberar();
    }
  }

  private adquirir(): Promise<void> {
    if (this.activos < this.maximo) {
      this.activos += 1;
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.pendientes.push(() => {
        this.activos += 1;
        resolve();
      });
    });
  }

  private liberar(): void {
    this.activos -= 1;

    const siguiente = this.pendientes.shift();
    if (siguiente !== undefined) {
      siguiente();
    }
  }
}
