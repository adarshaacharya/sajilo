import { useEffect, useState } from "react";

export type Palette = { up: string; down: string; muted: string };

function readPalette(): Palette {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => style.getPropertyValue(name).trim();
  return {
    up: token("--color-positive"),
    down: token("--color-holiday"),
    muted: token("--color-text-muted"),
  };
}

/**
 * The chart is painted on a canvas, so it cannot follow CSS variables by
 * itself. Re-read them whenever the theme changes, whether the user picked
 * one or the system switched.
 */
export function usePalette(): Palette {
  const [palette, setPalette] = useState(readPalette);
  useEffect(() => {
    const refresh = () => setPalette(readPalette());
    const observer = new MutationObserver(refresh);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    const media = window.matchMedia("(prefers-color-scheme: light)");
    media.addEventListener("change", refresh);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", refresh);
    };
  }, []);
  return palette;
}

/** `#rrggbb` at an alpha, for the fill under the line. */
export function withAlpha(hex: string, alpha: number): string {
  const digits = /^#([0-9a-f]{6})$/i.exec(hex)?.[1];
  if (!digits) return hex;
  const n = Number.parseInt(digits, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
