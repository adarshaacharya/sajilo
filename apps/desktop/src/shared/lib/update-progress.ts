import type { UpdateProgress } from "../context/updater-context";
import type { translate } from "./i18n";
import { digits, type NumeralStyle } from "./numerals";

const MB = 1024 * 1024;

/** Whole percent of the update that has come down, when its size is known. */
export function progressPercent(progress: UpdateProgress | null): number | null {
  if (!progress?.total) return null;
  return Math.min(100, Math.floor((progress.done * 100) / progress.total));
}

/** Megabytes to one decimal, in the user's digits. */
function megabytes(bytes: number, numerals: NumeralStyle): string {
  const tenths = Math.floor((bytes * 10) / MB);
  return `${digits(Math.floor(tenths / 10), numerals)}.${digits(tenths % 10, numerals)}`;
}

/** "6.2 of 12.4 MB", or "6.2 MB" when the server gave no size. */
export function progressLabel(
  progress: UpdateProgress,
  t: (key: Parameters<typeof translate>[0]) => string,
  numerals: NumeralStyle,
): string {
  const done = megabytes(progress.done, numerals);
  if (!progress.total) return t("updater.progress-size").replace("{done}", done);
  return t("updater.progress")
    .replace("{done}", done)
    .replace("{total}", megabytes(progress.total, numerals));
}
