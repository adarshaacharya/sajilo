import { digits, type NumeralStyle } from "./numerals";

/**
 * A time of day as Settings asks for it: `15:05` on the 24-hour clock,
 * `3:05 PM` on the 12-hour one. Seconds only when given.
 */
export function clockText(
  time: { hour: number; minute: number; second?: number },
  numerals: NumeralStyle,
  h24: boolean,
): string {
  const rest = `:${digits(time.minute, numerals, 2)}${
    time.second === undefined ? "" : `:${digits(time.second, numerals, 2)}`
  }`;
  if (h24) return `${digits(time.hour, numerals, 2)}${rest}`;
  const hour = time.hour % 12 || 12;
  return `${digits(hour, numerals)}${rest} ${time.hour < 12 ? "AM" : "PM"}`;
}

/** The `Intl` options for the same choice, for times read from a `Date`. */
export function hourOptions(h24: boolean): Intl.DateTimeFormatOptions {
  return h24 ? { hour: "2-digit", hourCycle: "h23" } : { hour: "numeric", hourCycle: "h12" };
}
