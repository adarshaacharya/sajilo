import { hourOptions } from "../../../shared/lib/clock-format";

/** The panchang is computed for Kathmandu, so its times read in Nepal time
 * wherever the computer is. */
const clockFormat = (h24: boolean) =>
  new Intl.DateTimeFormat("en-US", {
    ...hourOptions(h24),
    minute: "2-digit",
    timeZone: "Asia/Kathmandu",
  });
const CLOCK_12 = clockFormat(false);
const CLOCK_24 = clockFormat(true);
const DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kathmandu" });

export function nepalClock(iso: string, h24 = false): string {
  return (h24 ? CLOCK_24 : CLOCK_12).format(new Date(iso));
}

/** The Nepal calendar day an instant falls on, as `YYYY-MM-DD`. */
export function nepalDay(iso: string): string {
  return DAY.format(new Date(iso));
}
