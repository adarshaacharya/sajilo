import type { Conversion } from "../../../shared/lib/ipc";
import type { NumeralStyle } from "../../../shared/lib/numerals";
import { digits } from "../../../shared/lib/numerals";

export type CopyFormat = "nepaliNumerals" | "englishNumerals" | "longDate";

export const COPY_FORMATS: CopyFormat[] = ["nepaliNumerals", "englishNumerals", "longDate"];

export function nepaliLongText(conversion: Conversion, numerals: NumeralStyle): string {
  return `${digits(conversion.nepali.day, numerals)} ${conversion.nepaliMonthName} ${digits(conversion.nepali.year, numerals)}`;
}

export function gregorianLongText(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function isSaturday(iso: string): boolean {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return false;
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 6;
}

export function copyText(
  format: CopyFormat,
  conversion: Conversion,
  numerals: NumeralStyle,
): string {
  const { nepali, gregorian } = conversion;
  switch (format) {
    case "nepaliNumerals":
      return `${digits(nepali.year, numerals)}/${digits(nepali.month, numerals)}/${digits(nepali.day, numerals)}`;
    case "englishNumerals":
      return `${nepali.year}/${String(nepali.month).padStart(2, "0")}/${String(nepali.day).padStart(2, "0")}`;
    case "longDate":
      return gregorianLongText(gregorian);
  }
}

/** Chip labels — values are already shown above, so only the format name appears. */
export function copyShortLabel(format: CopyFormat): string {
  switch (format) {
    case "nepaliNumerals":
      return "२०४९";
    case "englishNumerals":
      return "2049";
    case "longDate":
      return "Long";
  }
}
