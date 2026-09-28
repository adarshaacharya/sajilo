import { useEffect, useState, useSyncExternalStore } from "react";
import { api } from "./ipc";

/**
 * The stopwatch, kept as timestamps rather than ticks: time since `startedAt`
 * plus what earlier runs added up to. So it stays exact while the popover is
 * hidden, and carries on across a restart, because nothing has to keep
 * counting. One stopwatch for the whole app: Tools shows it, and the mini
 * view does too while it has time on it.
 */
export interface StopwatchState {
  /** When the current run began (epoch ms), or null while stopped. */
  startedAt: number | null;
  /** Milliseconds from earlier runs, before the last pause. */
  banked: number;
  /** The total at each lap, in milliseconds, oldest first. */
  laps: number[];
}

const KEY = "stopwatch.v1";
const EMPTY: StopwatchState = { startedAt: null, banked: 0, laps: [] };

let state: StopwatchState = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function publish(next: StopwatchState, save = true) {
  state = next;
  for (const listener of listeners) listener();
  if (save) api.setSetting(KEY, next).catch(() => {});
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!loaded) {
    loaded = true;
    api
      .getSetting<StopwatchState>(KEY)
      .then((saved) => {
        if (
          saved &&
          typeof saved.banked === "number" &&
          Array.isArray(saved.laps) &&
          (saved.startedAt === null || typeof saved.startedAt === "number")
        ) {
          publish(saved, false);
        }
      })
      .catch(() => {});
  }
  return () => listeners.delete(listener);
}

export function useStopwatch(): StopwatchState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}

export function elapsed(watch: StopwatchState, now = Date.now()): number {
  return watch.banked + (watch.startedAt === null ? 0 : Math.max(0, now - watch.startedAt));
}

export function isRunning(watch: StopwatchState): boolean {
  return watch.startedAt !== null;
}

export function start() {
  if (state.startedAt !== null) return;
  publish({ ...state, startedAt: Date.now() });
}

export function pause() {
  if (state.startedAt === null) return;
  publish({ ...state, banked: elapsed(state), startedAt: null });
}

export function toggle() {
  if (state.startedAt === null) start();
  else pause();
}

export function lap() {
  if (state.startedAt === null) return;
  publish({ ...state, laps: [...state.laps, elapsed(state)] });
}

export function reset() {
  publish(EMPTY);
}

/**
 * The current reading, redrawn every animation frame while running (for the
 * hundredths) and left alone while stopped. `fps` lowers the rate where a
 * frame-by-frame redraw would be wasted, as on the mini strip.
 */
export function useElapsed(watch: StopwatchState, fps?: number): number {
  const [now, setNow] = useState(() => Date.now());
  const running = watch.startedAt !== null;
  useEffect(() => {
    if (!running) return;
    let frame = 0;
    let timer = 0;
    if (fps) {
      timer = window.setInterval(() => setNow(Date.now()), 1000 / fps);
    } else {
      const tick = () => {
        setNow(Date.now());
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }
    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(timer);
    };
  }, [running, fps]);
  return elapsed(watch, running ? now : undefined);
}

/** Splits milliseconds into the parts the clock face shows. */
export function parts(ms: number) {
  const total = Math.floor(ms / 10);
  return {
    hours: Math.floor(total / 360000),
    minutes: Math.floor(total / 6000) % 60,
    seconds: Math.floor(total / 100) % 60,
    hundredths: total % 100,
  };
}
