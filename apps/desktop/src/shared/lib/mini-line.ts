import { useSyncExternalStore } from "react";
import { api } from "./ipc";

/**
 * What the mini strip's second line shows. One choice: the strip has room for
 * one line besides the date and time. Changed by clicking that line, or in
 * Settings › Display; both read this one value.
 */
export const MINI_LINES = ["festival", "weather", "nepse", "forex", "radio"] as const;
export type MiniLine = (typeof MINI_LINES)[number];

const KEY = "miniViewShows";

let line: MiniLine = "festival";
let loaded = false;
const listeners = new Set<() => void>();

function publish(next: MiniLine) {
  line = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!loaded) {
    loaded = true;
    api
      .getSetting<string>(KEY)
      .then((saved) => {
        if (MINI_LINES.includes(saved as MiniLine)) publish(saved as MiniLine);
      })
      .catch(() => {});
  }
  return () => listeners.delete(listener);
}

export function useMiniLine(): MiniLine {
  return useSyncExternalStore(
    subscribe,
    () => line,
    () => line,
  );
}

export function setMiniLine(next: MiniLine) {
  publish(next);
  api.setSetting(KEY, next).catch(() => {});
}

/** The next choice after `current` among those `available`, for a click on
 * the line itself. */
export function nextMiniLine(current: MiniLine, available: readonly MiniLine[]): MiniLine {
  const from = available.indexOf(current);
  return available[(from + 1) % available.length] ?? "festival";
}
