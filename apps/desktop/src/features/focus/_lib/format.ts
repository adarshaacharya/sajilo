import type { useSettings } from "../../../shared/context/settings-context";
import type { BreakKind, FocusStatus } from "../../../shared/lib/ipc";
import { digits, type NumeralStyle } from "../../../shared/lib/numerals";

export type TFn = ReturnType<typeof useSettings>["t"];
export type I18nKey = Parameters<TFn>[0];

/** "4h 20m", or "20m" under an hour, in the user's numerals. */
export function screenTime(seconds: number, t: TFn, numerals: NumeralStyle): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours === 0) return t("focus.duration-minutes").replace("{m}", digits(minutes, numerals));
  return t("focus.duration")
    .replace("{h}", digits(hours, numerals))
    .replace("{m}", digits(minutes, numerals));
}

export const STATUS_LABELS: Record<FocusStatus, I18nKey> = {
  off: "focus.status.off",
  paused: "focus.status.paused",
  dayOff: "focus.status.dayOff",
  holiday: "focus.status.holiday",
  outsideHours: "focus.status.outsideHours",
  away: "focus.status.away",
  active: "focus.status.active",
};

export const KIND_LABELS: Record<BreakKind, I18nKey> = {
  eyes: "focus.kind.eyes",
  move: "focus.kind.move",
  water: "focus.kind.water",
};

export const KIND_NOTES: Record<BreakKind, I18nKey> = {
  eyes: "focus.note.eyes",
  move: "focus.note.move",
  water: "focus.note.water",
};

export const KIND_ICONS = { eyes: "eye", move: "walk", water: "drop" } as const;

/** `HH:MM` for a time input. */
export function clock(time: { hour: number; minute: number }): string {
  return `${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}`;
}

export function parseClock(value: string): { hour: number; minute: number } | null {
  const [hour, minute] = value.split(":").map(Number);
  if (hour === undefined || minute === undefined || Number.isNaN(hour) || Number.isNaN(minute)) {
    return null;
  }
  return { hour, minute };
}
