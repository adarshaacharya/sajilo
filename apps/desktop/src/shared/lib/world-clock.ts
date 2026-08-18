import { useEffect, useState } from "react";

export interface ClockCity {
  timeZone: string;
  city: string;
  region: string;
}

/** A hand-picked flag for the common ones; everything else gets a neutral glyph
 * rather than a wrong-guessed one — there is no native timezone→country map. */
const FLAGS: Record<string, string> = {
  "Asia/Kathmandu": "🇳🇵",
  "Asia/Qatar": "🇶🇦",
  "Asia/Dubai": "🇦🇪",
  "Asia/Riyadh": "🇸🇦",
  "Asia/Kuwait": "🇰🇼",
  "Asia/Bahrain": "🇧🇭",
  "Asia/Muscat": "🇴🇲",
  "Europe/London": "🇬🇧",
  "America/New_York": "🇺🇸",
  "America/Chicago": "🇺🇸",
  "America/Denver": "🇺🇸",
  "America/Los_Angeles": "🇺🇸",
  "America/Toronto": "🇨🇦",
  "America/Vancouver": "🇨🇦",
  "Australia/Sydney": "🇦🇺",
  "Australia/Melbourne": "🇦🇺",
  "Asia/Tokyo": "🇯🇵",
  "Asia/Seoul": "🇰🇷",
  "Asia/Kuala_Lumpur": "🇲🇾",
  "Asia/Singapore": "🇸🇬",
  "Asia/Kolkata": "🇮🇳",
  "Asia/Dhaka": "🇧🇩",
  "Asia/Hong_Kong": "🇭🇰",
  "Asia/Shanghai": "🇨🇳",
  "Asia/Bangkok": "🇹🇭",
  "Europe/Paris": "🇫🇷",
  "Europe/Berlin": "🇩🇪",
  "Europe/Madrid": "🇪🇸",
  "Europe/Rome": "🇮🇹",
  "Europe/Amsterdam": "🇳🇱",
  "Europe/Dublin": "🇮🇪",
  "Europe/Moscow": "🇷🇺",
  "Africa/Cairo": "🇪🇬",
  "Africa/Johannesburg": "🇿🇦",
  "Africa/Lagos": "🇳🇬",
  "Pacific/Auckland": "🇳🇿",
};

const DEFAULT_FLAG = "🌐";

function parseTimeZone(timeZone: string): ClockCity {
  const parts = timeZone.split("/");
  const region = (parts[0] ?? timeZone).replace(/_/g, " ");
  const city = (parts[parts.length - 1] ?? timeZone).replace(/_/g, " ");
  return { timeZone, city, region };
}

/**
 * Every IANA zone the runtime knows about — native, no dependency. `Etc/*`
 * and zone-less entries (`UTC`, `GMT`) are noise for a city picker, so they're
 * dropped; everything with a real `Region/City` shape stays.
 */
export const ALL_TIMEZONES: ClockCity[] = (
  typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : []
)
  .filter((tz) => tz.includes("/") && !tz.startsWith("Etc/"))
  .map(parseTimeZone)
  .sort((a, b) => a.city.localeCompare(b.city));

export function cityFor(timeZone: string): ClockCity {
  return ALL_TIMEZONES.find((c) => c.timeZone === timeZone) ?? parseTimeZone(timeZone);
}

export function flagFor(timeZone: string): string {
  return FLAGS[timeZone] ?? DEFAULT_FLAG;
}

const RESULT_LIMIT = 40;

/**
 * Case-insensitive substring match over city and region name. Empty on an
 * empty query rather than falling back to a "popular" subset — a short list
 * that isn't the whole list reads as the whole list, which is confusing the
 * moment a search reveals there was far more underneath it.
 */
export function searchTimezones(query: string): ClockCity[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return ALL_TIMEZONES.filter(
    (c) => c.city.toLowerCase().includes(needle) || c.region.toLowerCase().includes(needle),
  ).slice(0, RESULT_LIMIT);
}

const NEPAL_TIME_ZONE = "Asia/Kathmandu";

function formatTime(timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
}

/** `YYYY-MM-DD` in the given timezone, so two zones' calendar dates can be
 * compared without a DST-sensitive time-of-day component in the way. */
function dateKey(timeZone: string, at: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(at);
}

/** Full weekday + date, for the tooltip — shown on hover, not by default. */
export function fullDateFor(timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
}

/** Whole days this timezone's calendar date is ahead of (+) or behind (-)
 * Nepal's, right now. Zero for same-day, which is the common case. */
function dayOffsetFromNepal(timeZone: string, at: Date): number {
  const here = new Date(`${dateKey(timeZone, at)}T00:00:00Z`);
  const nepal = new Date(`${dateKey(NEPAL_TIME_ZONE, at)}T00:00:00Z`);
  return Math.round((here.getTime() - nepal.getTime()) / 86_400_000);
}

export interface WorldClockReading {
  time: string;
  /** +1 "tomorrow there", -1 "yesterday there", 0 same day as Nepal. */
  dayOffset: number;
}

/**
 * `+1d` / `-1d`, never a bare `-1` — a signed number alone reads as a UTC
 * offset (that *is* the actual convention for that notation), not a day
 * difference. The `d` is what disambiguates it.
 */
export function formatDayOffset(offset: number): string {
  return offset > 0 ? `+${offset}d` : `${offset}d`;
}

/**
 * `HH:MM` and day offset for every requested timezone, off one shared
 * interval — not one `setInterval` per clock, however many are selected.
 */
export function useWorldClocks(timeZones: string[]): Record<string, WorldClockReading> {
  const key = timeZones.join(",");
  const [times, setTimes] = useState<Record<string, WorldClockReading>>({});

  useEffect(() => {
    const zones = key ? key.split(",") : [];
    const tick = () => {
      const now = new Date();
      const next: Record<string, WorldClockReading> = {};
      for (const tz of zones) {
        next[tz] = { time: formatTime(tz), dayOffset: dayOffsetFromNepal(tz, now) };
      }
      setTimes(next);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [key]);

  return times;
}
