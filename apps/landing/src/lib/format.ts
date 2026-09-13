/** Devanagari digits, for the numbers that read as Nepali on the page. */
export function ne(n: number | string): string {
  return String(n).replace(/[0-9]/g, (d) => "०१२३४५६७८९"[Number(d)]);
}

/** Nepali grouping: last three digits, then pairs. 306800 -> 3,06,800. */
export function rs(n: number): string {
  const [int, frac] = Math.abs(n).toFixed(n % 1 === 0 ? 0 : 2).split(".");
  const last3 = int.slice(-3);
  const rest = int.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  const body = rest ? `${rest},${last3}` : last3;
  return (n < 0 ? "−" : "") + (frac ? `${body}.${frac}` : body);
}

export function signed(n: number, digits = 0): string {
  const s = Math.abs(n).toFixed(digits);
  return n > 0 ? `+${s}` : n < 0 ? `−${s}` : s;
}

const WEEKDAYS = ["आइतबार", "सोमबार", "मङ्गलबार", "बुधबार", "बिहीबार", "शुक्रबार", "शनिबार"];
export const weekdayNe = (w: number) => WEEKDAYS[w] ?? "";

export function longDate(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "05:35" in Nepal time from a UTC instant. Fixed +05:45, no DST. */
export function nepalClock(iso: string): string {
  const d = new Date(new Date(iso).getTime() + (5 * 60 + 45) * 60_000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export function daysAway(n: number): string {
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  return `In ${n} days`;
}
