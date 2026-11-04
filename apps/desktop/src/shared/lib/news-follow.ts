import type { NewsFollowMode } from "../../types/api/NewsFollowMode";
import type { NewsFollows } from "../../types/api/NewsFollows";
import type { translate } from "./i18n";

type T = (key: Parameters<typeof translate>[0]) => string;

/** The spacings the shell accepts for a summary of new stories; see
 * `NewsFollows::EVERY_HOURS`. */
export const EVERY_HOURS = [1, 2, 3, 4, 6] as const;

/** An hour of the day as the settings show it: 08:00. */
export function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

export function everyLabel(t: T, hours: number): string {
  return hours === 1 ? t("news.hour") : t("news.hours").replace("{n}", String(hours));
}

export const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => ({
  id: String(hour),
  label: hourLabel(hour),
}));

/** How a followed source is heard from, in a line. */
export function followSummary(t: T, mode: NewsFollowMode, follows: NewsFollows): string {
  switch (mode) {
    case "each":
      return t("news.follow.each");
    case "hours":
      return t("news.follow.hours").replace("{hours}", everyLabel(t, follows.everyHours));
    case "daily":
      return t("news.follow.daily").replace("{time}", hourLabel(follows.dailyHour));
  }
}
