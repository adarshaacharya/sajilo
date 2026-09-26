/** The app's own palette, so the video looks like the product it shows. */
export const color = {
  canvas: "#0c0c0e",
  surface: "#18181b",
  border: "rgba(255,255,255,0.09)",
  text: "#f5f5f7",
  secondary: "#aeaeb2",
  muted: "#8e8e93",
  gold: "#d4a84a",
  holiday: "#ff6a52",
};

export const font = {
  latin: "Manrope, sans-serif",
  nepali: "'Noto Sans Devanagari', Manrope, sans-serif",
};

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

/** Seconds to frames. */
export const s = (seconds: number) => Math.round(seconds * FPS);
