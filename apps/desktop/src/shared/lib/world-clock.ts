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

/** Shown before a search is typed — the same cities that used to be the whole
 * list, now just the head start. */
export const POPULAR_TIMEZONES = [
  "Asia/Kathmandu",
  "Asia/Qatar",
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Kuwait",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
  "Australia/Sydney",
  "Asia/Tokyo",
  "Asia/Kuala_Lumpur",
  "Asia/Kolkata",
];

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

/** Case-insensitive substring match over city and region name. */
export function searchTimezones(query: string): ClockCity[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return POPULAR_TIMEZONES.map(cityFor);
  return ALL_TIMEZONES.filter(
    (c) => c.city.toLowerCase().includes(needle) || c.region.toLowerCase().includes(needle),
  ).slice(0, RESULT_LIMIT);
}

function formatTime(timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
}

/**
 * `HH:MM` for every requested timezone, off one shared interval — not one
 * `setInterval` per clock, however many are selected.
 */
export function useWorldClocks(timeZones: string[]): Record<string, string> {
  const key = timeZones.join(",");
  const [times, setTimes] = useState<Record<string, string>>({});

  useEffect(() => {
    const zones = key ? key.split(",") : [];
    const tick = () => {
      const next: Record<string, string> = {};
      for (const tz of zones) next[tz] = formatTime(tz);
      setTimes(next);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [key]);

  return times;
}
