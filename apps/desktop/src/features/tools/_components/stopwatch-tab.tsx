import { useEffect, useRef, useState } from "react";
import { useSettings } from "../../../shared/context/settings-context";
import { digits, type NumeralStyle } from "../../../shared/lib/numerals";
import * as stopwatch from "../../../shared/lib/stopwatch";

const RADIUS = 88;
const RING = 2 * Math.PI * RADIUS;
const MINUTE = 60_000;
/** How long the arc takes to wind back to zero on Reset. */
const UNWIND_MS = 450;

/** "12:47", or "1:02:47" past an hour; hundredths are drawn apart. */
export function clockText(ms: number, numerals: NumeralStyle): string {
  const { hours, minutes, seconds } = stopwatch.parts(ms);
  const mm = digits(minutes, numerals, 2);
  const ss = digits(seconds, numerals, 2);
  return hours > 0 ? `${digits(hours, numerals)}:${mm}:${ss}` : `${mm}:${ss}`;
}

function lapText(ms: number, numerals: NumeralStyle): string {
  const { hundredths } = stopwatch.parts(ms);
  return `${clockText(ms, numerals)}.${digits(hundredths, numerals, 2)}`;
}

/** A point on the ring `share` of the way round from the top. */
function onRing(share: number, radius = RADIUS) {
  const angle = share * 2 * Math.PI - Math.PI / 2;
  return { x: 100 + radius * Math.cos(angle), y: 100 + radius * Math.sin(angle) };
}

/**
 * The stopwatch. The dial is the button: tap it to start and pause. A gold
 * arc sweeps once a minute with a dot riding its tip, each lap leaves a notch
 * on the ring, the digits breathe while paused, and Reset winds the arc back
 * rather than blinking it away. Space, L and R do the same from the keyboard.
 */
export function StopwatchTab() {
  const { t, numerals } = useSettings();
  const watch = stopwatch.useStopwatch();
  const ms = stopwatch.useElapsed(watch);
  const running = stopwatch.isRunning(watch);
  const started = ms > 0 || running;

  // A pulse on start, a flash along the ring each full minute, and the
  // unwind on reset: each is a class that plays once when its key changes.
  const [pulse, setPulse] = useState(0);
  const minute = Math.floor(ms / MINUTE);
  const lastMinute = useRef(minute);
  const [flash, setFlash] = useState(0);
  useEffect(() => {
    if (minute > lastMinute.current && running) setFlash((count) => count + 1);
    lastMinute.current = minute;
  }, [minute, running]);
  const [unwinding, setUnwinding] = useState(false);
  const [pressed, setPressed] = useState<"lap" | "reset" | null>(null);

  const toggle = () => {
    if (!running) setPulse((count) => count + 1);
    stopwatch.toggle();
  };
  const reset = () => {
    if (!started) return;
    setUnwinding(true);
    stopwatch.reset();
    window.setTimeout(() => setUnwinding(false), UNWIND_MS);
  };
  const lap = () => stopwatch.lap();

  // Keyboard: Space starts and pauses, L laps, R resets; the key lights its
  // button for a moment so the press is seen.
  const actions = useRef({ toggle, reset, lap });
  actions.current = { toggle, reset, lap };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input, textarea, select, [contenteditable]")) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === " ") {
        // A focused button already answers Space with its own click.
        if (target?.closest("button")) return;
        event.preventDefault();
        actions.current.toggle();
      } else if (key === "l") {
        actions.current.lap();
        setPressed("lap");
      } else if (key === "r") {
        actions.current.reset();
        setPressed("reset");
      } else {
        return;
      }
      window.setTimeout(() => setPressed(null), 160);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const share = unwinding ? 0 : (ms % MINUTE) / MINUTE;
  const tip = onRing(share);
  const { hundredths } = stopwatch.parts(ms);

  // Newest first, with the lap still running on top while the watch runs.
  const laps = watch.laps.map((total, index) => ({
    index: index + 1,
    total,
    split: total - (watch.laps[index - 1] ?? 0),
  }));
  const splits = laps.map((entry) => entry.split);
  const fastest = laps.length >= 3 ? Math.min(...splits) : null;
  const slowest = laps.length >= 3 ? Math.max(...splits) : null;
  const current = watch.laps.length > 0 && started ? ms - (watch.laps.at(-1) ?? 0) : null;

  const hint = running
    ? t("stopwatch.tap-pause")
    : started
      ? t("stopwatch.tap-resume")
      : t("stopwatch.tap-start");

  return (
    <div className="space-y-3 pt-1">
      <button
        type="button"
        onClick={toggle}
        aria-label={hint}
        className={`stopwatch-dial${running ? " is-running" : ""}${started && !running ? " is-paused" : ""}`}
      >
        <svg viewBox="0 0 200 200" aria-hidden="true">
          <circle cx="100" cy="100" r={RADIUS} className="stopwatch-dial__track" />
          {/* Second marks, every five seconds, the quarter-minutes longer. */}
          {Array.from({ length: 12 }, (_, index) => {
            const inner = onRing(index / 12, index % 3 === 0 ? 76 : 79);
            const outer = onRing(index / 12, 82);
            return (
              <line
                // biome-ignore lint/suspicious/noArrayIndexKey: a fixed dial face
                key={index}
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                className="stopwatch-dial__mark"
              />
            );
          })}
          <circle
            cx="100"
            cy="100"
            r={RADIUS}
            className={`stopwatch-dial__arc${unwinding ? " is-unwinding" : ""}`}
            strokeDasharray={RING}
            strokeDashoffset={RING * (1 - share)}
          />
          {/* Each lap leaves a notch where the arc was at that moment. */}
          {watch.laps.map((total) => {
            const at = (total % MINUTE) / MINUTE;
            const inner = onRing(at, RADIUS - 7);
            const outer = onRing(at, RADIUS + 7);
            return (
              <line
                key={total}
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                className="stopwatch-dial__notch"
              />
            );
          })}
          {started && !unwinding && (
            <circle cx={tip.x} cy={tip.y} r="5" className="stopwatch-dial__tip" />
          )}
          <circle
            key={`flash-${flash}`}
            cx="100"
            cy="100"
            r={RADIUS}
            className={flash > 0 ? "stopwatch-dial__flash" : "hidden"}
          />
          <circle
            key={`pulse-${pulse}`}
            cx="100"
            cy="100"
            r={RADIUS}
            className={pulse > 0 ? "stopwatch-dial__pulse" : "hidden"}
          />
        </svg>
        <span className="stopwatch-dial__face">
          <span className="stopwatch-dial__time tabular-nums">{clockText(ms, numerals)}</span>
          <span className="stopwatch-dial__hundredths tabular-nums">
            .{digits(hundredths, numerals, 2)}
          </span>
          <span className="stopwatch-dial__hint">{hint}</span>
        </span>
      </button>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={reset}
          disabled={!started}
          className={`settings-btn w-full justify-center${pressed === "reset" ? " is-pressed" : ""}`}
        >
          {t("stopwatch.reset")}
          <kbd className="stopwatch-key">R</kbd>
        </button>
        <button
          type="button"
          onClick={lap}
          disabled={!running}
          className={`settings-btn settings-btn--accent w-full justify-center${pressed === "lap" ? " is-pressed" : ""}`}
        >
          {t("stopwatch.lap")}
          <kbd className="stopwatch-key">L</kbd>
        </button>
      </div>

      {(laps.length > 0 || current !== null) && (
        <ol className="surface-card divide-y divide-divider overflow-hidden">
          {current !== null && (
            <li className="stopwatch-lap stopwatch-lap--current">
              <span>{t("stopwatch.lap-n").replace("{n}", digits(laps.length + 1, numerals))}</span>
              <span className="tabular-nums">{lapText(current, numerals)}</span>
              <span className="tabular-nums text-text-muted">{lapText(ms, numerals)}</span>
            </li>
          )}
          {[...laps].reverse().map((entry) => (
            <li
              key={entry.index}
              className={`stopwatch-lap${entry.split === fastest ? " stopwatch-lap--fastest" : ""}${
                entry.split === slowest ? " stopwatch-lap--slowest" : ""
              }`}
            >
              <span>{t("stopwatch.lap-n").replace("{n}", digits(entry.index, numerals))}</span>
              <span className="tabular-nums">{lapText(entry.split, numerals)}</span>
              <span className="tabular-nums text-text-muted">{lapText(entry.total, numerals)}</span>
            </li>
          ))}
        </ol>
      )}

      <p className="px-0.5 text-center text-[10px] text-text-muted">
        {t("stopwatch.keeps-running")}
      </p>
    </div>
  );
}
