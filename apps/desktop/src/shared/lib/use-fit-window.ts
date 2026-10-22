import { useLayoutEffect } from "react";
import { api } from "./ipc";

/** A card's own window, fitted to what it holds: the same card can be one
 * line of text in English and two in Nepali, and a fixed height leaves either
 * a gap or a clipped button. */
export function useFitWindow(element: HTMLElement | null) {
  useLayoutEffect(() => {
    if (!element) return;
    const fit = () => {
      const height = Math.ceil(element.getBoundingClientRect().height);
      // The shell sizes it, so a card that grows can move up rather than
      // run off the bottom of the screen.
      void api.fitCard(height).catch(() => {});
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
}
