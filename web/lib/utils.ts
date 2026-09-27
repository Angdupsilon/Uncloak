import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge class names, resolving Tailwind conflicts so a caller's class can
 * override a component default rather than both landing in the DOM.
 * This is the shadcn/ui convention; components under components/ui expect it.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
