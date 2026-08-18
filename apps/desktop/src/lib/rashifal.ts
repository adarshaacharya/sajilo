import type { Freshness } from "../types/api/Freshness";

const KATHMANDU = "Asia/Kathmandu";

function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: KATHMANDU });
}

/** True when the cached reading was fetched on today's Nepal calendar day. */
export function isReadingFromToday(freshness: Freshness | undefined): boolean {
  if (!freshness) return true;
  const stamp = freshness.sourceTimestamp ?? freshness.fetchedAt;
  return dayKey(stamp) === dayKey(new Date().toISOString());
}

export function publishedStamp(freshness: Freshness | undefined): string | undefined {
  if (!freshness) return undefined;
  const stamp = freshness.sourceTimestamp ?? freshness.fetchedAt;
  return new Date(stamp).toLocaleString(undefined, {
    timeZone: KATHMANDU,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
