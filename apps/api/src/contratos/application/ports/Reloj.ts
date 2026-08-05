export interface Reloj {
  /**
   * The authoritative signing instant. Server-side by definition: the tablet's
   * clock is not evidence of anything.
   */
  ahora(): Date;
}
