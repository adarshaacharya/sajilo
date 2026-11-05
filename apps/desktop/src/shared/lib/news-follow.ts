import type { NewsFollowMode } from "../../types/api/NewsFollowMode";
import type { NewsFollows } from "../../types/api/NewsFollows";
import type { translate } from "./i18n";

type T = (key: Parameters<typeof translate>[0]) => string;

/** The spacings the shell accepts for a summary of new stories; see
 * `NewsFollows::EVERY_HOURS`. */
export const EVERY_HOURS = [1, 2, 3, 4, 6] as const;

/** A time of day, in minutes after midnight, as the settings show it: 09:30. */
export function timeLabel(minutes: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/**
 * A time as people type it, in minutes after midnight, or null: "9", "930",
 * "9:30", "21.15", "9pm", "9:30 am". Without am/pm it is the 24-hour clock.
 */
export function parseTime(text: string): number | null {
  const match = /^(\d{1,2})(?:[:.]?(\d{2}))?\s*(am|pm|a|p)?$/i.exec(text.trim());
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const half = match[3]?.toLowerCase()[0];
  if (minute > 59) return null;
  if (half) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (half === "p" ? 12 : 0);
  }
  if (hour > 23) return null;
  return hour * 60 + minute;
}

export function everyLabel(t: T, hours: number): string {
  return hours === 1 ? t("news.hour") : t("news.hours").replace("{n}", String(hours));
}

/** How a followed source is heard from, in a line. */
export function followSummary(t: T, mode: NewsFollowMode, follows: NewsFollows): string {
  switch (mode) {
    case "each":
      return t("news.follow.each");
    case "hours":
      return t("news.follow.hours").replace("{hours}", everyLabel(t, follows.everyHours));
    case "daily":
      return t("news.follow.daily").replace("{time}", follows.dailyTimes.map(timeLabel).join(", "));
  }
}
