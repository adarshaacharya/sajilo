import { useEffect, useState } from "react";

const FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Kathmandu",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export interface NepalClock {
  hour: number;
  minute: number;
  second: number;
}

function readClock(): NepalClock {
  const parts = FORMATTER.formatToParts(new Date());
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { hour: get("hour"), minute: get("minute"), second: get("second") };
}

/**
 * Ticks once a second. Always Nepal time, regardless of the machine's own
 * timezone — computed client-side so the dashboard doesn't round-trip to Rust
 * just to advance a clock.
 */
export function useNepalClock(): NepalClock {
  const [clock, setClock] = useState(readClock);

  useEffect(() => {
    const id = setInterval(() => setClock(readClock()), 1000);
    return () => clearInterval(id);
  }, []);

  return clock;
}
