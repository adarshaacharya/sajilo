import { useLayoutEffect } from "react";
import { api } from "./ipc";

/** A card's own window, fitted to what it holds: the same card can be one
 * line of text in English and two in Nepali, and a fixed height leaves either
 * a gap or a clipped button. */
export function useFitWindow(element: HTMLElement | null) {
  useLayoutEffect(() => {
    if (!element) return;
    // The window opens before it knows the card's height, so the card stays
    // out of sight until its window fits it, rather than showing cut off and
    // then jumping. Hidden, it still lays out and can be measured.
    element.style.visibility = "hidden";
    const reveal = () => requestAnimationFrame(() => element.style.removeProperty("visibility"));
    const fit = () => {
      const height = Math.ceil(element.getBoundingClientRect().height);
      // The shell sizes it, so a card that grows can move up rather than
      // run off the bottom of the screen.
      api.fitCard(height).then(reveal, reveal);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
}
