/** The panchang is computed for Kathmandu, so its times read in Nepal time
 * wherever the computer is. */
const CLOCK = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Kathmandu",
});
const DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kathmandu" });

export function nepalClock(iso: string): string {
  return CLOCK.format(new Date(iso));
}

/** The Nepal calendar day an instant falls on, as `YYYY-MM-DD`. */
export function nepalDay(iso: string): string {
  return DAY.format(new Date(iso));
}
