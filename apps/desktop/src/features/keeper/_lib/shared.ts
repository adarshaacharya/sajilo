import type { useSettings } from "../../../shared/context/settings-context";
import { api, type KeeperDate } from "../../../shared/lib/ipc";

export type TFn = ReturnType<typeof useSettings>["t"];
export type I18nKey = Parameters<TFn>[0];
/** Stored on reminders for filtering and backups; not asked for in the UI. */
export type Category = "identity" | "vehicle" | "home" | "money" | "health" | "application";

export function id() {
  return crypto.randomUUID();
}

export async function todayKeeperDate(): Promise<KeeperDate> {
  const today = await api.today();
  return api.resolveKeeperDate({
    calendar: "bs",
    year: today.nepali.year,
    month: today.nepali.month,
    day: today.nepali.day,
  });
}

export function formatDate(date: string) {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(`${date}T00:00:00`));
}

export function formatBs(date: KeeperDate) {
  return `BS ${date.bs.year}-${String(date.bs.month).padStart(2, "0")}-${String(date.bs.day).padStart(2, "0")}`;
}

/** Whole days from today to an AD date string; negative once it has passed. */
export function daysUntil(date: string) {
  const target = new Date(`${date}T00:00:00`).getTime();
  return Math.ceil((target - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
}

/** One urgency scale for everything Keeper dates: overdue, within a month,
 * or comfortably ahead. */
export function dueTone(days: number) {
  return days < 0 ? "text-holiday" : days <= 30 ? "text-accent-mark" : "text-text-secondary";
}

export function dueLabel(t: TFn, days: number) {
  return days < 0
    ? `${Math.abs(days)}d ${t("keeper.days-overdue")}`
    : days === 0
      ? t("keeper.today")
      : `${days}d`;
}
