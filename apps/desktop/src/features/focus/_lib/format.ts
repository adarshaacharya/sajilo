import { useSettings } from "../../../shared/context/settings-context";
import type { BreakKind, FocusSettings, FocusStatus } from "../../../shared/lib/ipc";
import { digits, type NumeralStyle } from "../../../shared/lib/numerals";

export type TFn = ReturnType<typeof useSettings>["t"];
export type I18nKey = Parameters<TFn>[0];

/**
 * The Routine tab's numbers follow the language, not the numeral setting.
 * That setting is for the calendar, where २६ गते belongs in Devanagari even
 * in English; here the numbers sit inside sentences, and "In ५ min" reads as
 * a mistake.
 */
export function useSentenceNumerals(): NumeralStyle {
  const { language } = useSettings();
  return language === "ne" ? "devanagari" : "latin";
}

/** Millilitres as litres in the user's numerals: 1250 → "1.25". */
export function litres(ml: number, numerals: NumeralStyle): string {
  const text = (ml / 1000).toFixed(2).replace(/\.?0+$/, "");
  return text.replace(/\d/g, (digit) => digits(Number(digit), numerals));
}

/** A length of time as hours and minutes: "6h 40m", or "25 min" under an
 * hour. */
export function duration(seconds: number, numerals: NumeralStyle, t: TFn): string {
  const minutes = Math.round(seconds / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return t("focus.week.m").replace("{m}", digits(m, numerals));
  return t("focus.week.hm").replace("{h}", digits(h, numerals)).replace("{m}", digits(m, numerals));
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
  custom: "focus.kind.custom",
  endOfDay: "focus.kind.endOfDay",
  breakfast: "focus.kind.breakfast",
  lunch: "focus.kind.lunch",
  dinner: "focus.kind.dinner",
  bedtime: "focus.kind.bedtime",
};

/** What a break is called: the user's own words for their reminder. */
export function kindLabel(kind: BreakKind, settings: FocusSettings, t: TFn): string {
  if (kind === "custom" && settings.custom.label.trim()) return settings.custom.label;
  return t(KIND_LABELS[kind]);
}

export const KIND_ICONS = {
  eyes: "eye",
  move: "walk",
  water: "drop",
  custom: "star",
  endOfDay: "sunset",
  breakfast: "sunrise",
  lunch: "meal",
  dinner: "meal",
  bedtime: "sleep",
} as const;

export const KIND_TINTS: Record<BreakKind, string> = {
  eyes: "var(--color-accent-mark)",
  move: "var(--color-positive)",
  water: "var(--color-weather-tint)",
  custom: "var(--color-forex-tint)",
  endOfDay: "var(--color-holiday)",
  breakfast: "var(--color-accent-mark)",
  lunch: "var(--color-positive)",
  dinner: "var(--color-positive)",
  bedtime: "var(--color-weather-tint)",
};

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
