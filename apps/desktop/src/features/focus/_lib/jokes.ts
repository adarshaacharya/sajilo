/** Break card jokes, as translation keys. Each list is one rotation. */
export const JOKES = {
  eyes: [
    "break.joke.eyes.1",
    "break.joke.eyes.2",
    "break.joke.eyes.3",
    "break.joke.eyes.4",
    "break.joke.eyes.5",
    "break.joke.eyes.6",
    "break.joke.eyes.7",
    "break.joke.eyes.8",
    "break.joke.eyes.9",
    "break.joke.eyes.10",
    "break.joke.eyes.11",
    "break.joke.eyes.12",
  ],
  move: [
    "break.joke.move.1",
    "break.joke.move.2",
    "break.joke.move.3",
    "break.joke.move.4",
    "break.joke.move.5",
    "break.joke.move.6",
    "break.joke.move.7",
    "break.joke.move.8",
    "break.joke.move.9",
    "break.joke.move.10",
    "break.joke.move.11",
    "break.joke.move.12",
  ],
  water: [
    "break.joke.water.1",
    "break.joke.water.2",
    "break.joke.water.3",
    "break.joke.water.4",
    "break.joke.water.5",
    "break.joke.water.6",
    "break.joke.water.7",
    "break.joke.water.8",
    "break.joke.water.9",
    "break.joke.water.10",
    "break.joke.water.11",
    "break.joke.water.12",
  ],
  endOfDay: [
    "break.joke.endOfDay.1",
    "break.joke.endOfDay.2",
    "break.joke.endOfDay.3",
    "break.joke.endOfDay.4",
    "break.joke.endOfDay.5",
    "break.joke.endOfDay.6",
  ],
  done: [
    "break.joke.done.1",
    "break.joke.done.2",
    "break.joke.done.3",
    "break.joke.done.4",
    "break.joke.done.5",
    "break.joke.done.6",
  ],
} as const;

/**
 * One joke per card, fixed for as long as that card is open: picked from
 * when the card started, so a re-render or a shake never swaps the line
 * mid-read, while the next card lands on a different one.
 */
export function pick<T>(lines: readonly T[], seed: string): T {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return lines[Math.abs(hash) % lines.length] as T;
}
