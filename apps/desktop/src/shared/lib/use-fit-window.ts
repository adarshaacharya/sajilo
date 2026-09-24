import { useLayoutEffect } from "react";

/** Every floating card's width; matches `card_window::WIDTH` in the shell. */
export const CARD_WIDTH = 380;

/** A card's own window, fitted to what it holds: the same card can be one
 * line of text in English and two in Nepali, and a fixed height leaves either
 * a gap or a clipped button. */
export function useFitWindow(element: HTMLElement | null) {
  useLayoutEffect(() => {
    if (!element) return;
    const fit = () => {
      const height = Math.ceil(element.getBoundingClientRect().height);
      void import("@tauri-apps/api/window")
        .then(({ getCurrentWindow, LogicalSize }) =>
          getCurrentWindow().setSize(new LogicalSize(CARD_WIDTH, height)),
        )
        .catch(() => {});
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
}
