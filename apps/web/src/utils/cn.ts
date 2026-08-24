import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * design-system-migration PR1 (design-system-foundation: "`cn()` replaces
 * manual class concatenation") — merges an incoming `className` with a
 * component's own default classes deterministically, so two conflicting
 * Tailwind utilities (e.g. two `bg-*` classes) resolve to one winner
 * instead of both landing in the DOM.
 */
export function cn(...entradas: ReadonlyArray<ClassValue>): string {
  return twMerge(clsx(entradas));
}
