import { useEffect, useRef, useState } from "react";
import { Icon } from "../../shared/components/icon";
import { useSettings } from "../../shared/context/settings-context";
import { api, type Today } from "../../shared/lib/ipc";
import { useMiniLine } from "../../shared/lib/mini-line";
import { digits } from "../../shared/lib/numerals";
import { setMini, useDragWhenKept } from "../../shared/lib/popover-kept";
import * as stopwatch from "../../shared/lib/stopwatch";
import { MiniLine, StopwatchLine } from "./_components/mini-line";
import { useNepalClock } from "./_lib/nepal-clock";

const WEEKDAYS_NE = ["आइत", "सोम", "मंगल", "बुध", "बिहि", "शुक्र", "शनि"];
const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Today and the next event are asked again this often, so the strip turns
 * over at midnight without anyone touching it. */
const REFRESH_MS = 5 * 60 * 1000;

function shortGregorian(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/**
 * The mini view: the kept popover shrunk to a strip to leave on the desktop.
 * Today's BS date, the AD date, Nepal time, and one more line the user
 * picks (see `MiniLine`).
 * It drags from anywhere but its buttons; the expand button opens the full
 * app again, still pinned.
 */
export function MiniView() {
  const { t, numerals, language } = useSettings();
  const clock = useNepalClock();
  const [today, setToday] = useState<Today | null>(null);
  const line = useMiniLine();
  // A stopwatch with time on it takes the second line until it is reset.
  const watch = stopwatch.useStopwatch();
  const timing = stopwatch.isRunning(watch) || watch.banked > 0;
  const strip = useRef<HTMLDivElement>(null);
  useDragWhenKept(strip);

  useEffect(() => {
    const load = () => {
      api
        .today()
        .then(setToday)
        .catch(() => {});
    };
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  const weekday = today ? (language === "en" ? WEEKDAYS_EN : WEEKDAYS_NE)[today.weekday] : "";

  return (
    <div ref={strip} className="mini-view" data-kept>
      <div className="mini-view__plate">
        <span className="mini-view__day tabular-nums">
          {today ? digits(today.nepali.day, numerals) : ""}
        </span>
        <span className="mini-view__weekday">{weekday}</span>
      </div>

      <div className="min-w-0 flex-1">
        <p className="mini-view__date truncate">
          {today && (
            <>
              {today.nepaliMonthName} {digits(today.nepali.year, numerals)}
              <span className="mini-view__muted"> · {shortGregorian(today.gregorian)}</span>
            </>
          )}
        </p>
        {timing ? <StopwatchLine /> : <MiniLine choice={line} />}
      </div>

      <span className="mini-view__clock tabular-nums">
        {digits(clock.hour, numerals, 2)}:{digits(clock.minute, numerals, 2)}
      </span>

      <button
        type="button"
        onClick={() => setMini(false)}
        aria-label={t("popover.expand")}
        title={t("popover.expand")}
        className="icon-btn shrink-0"
      >
        <Icon name="expand" className="size-3.5" />
      </button>
    </div>
  );
}
