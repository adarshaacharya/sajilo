import type { Conversion } from "../../../shared/lib/ipc";
import type { NumeralStyle } from "../../../shared/lib/numerals";
import { digits } from "../../../shared/lib/numerals";

/** The BS date in Devanagari and in Latin digits, and the AD date. */
export type CopyFormat = "bsDevanagari" | "bsLatin" | "ad";

export const COPY_FORMATS: CopyFormat[] = ["bsDevanagari", "bsLatin", "ad"];

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

/**
 * Exactly what the chip copies, so the chip can show it: a label like "Long"
 * or a sample year left people guessing which format they would get.
 */
export function copyText(format: CopyFormat, conversion: Conversion): string {
  const { nepali, gregorian } = conversion;
  switch (format) {
    case "bsDevanagari":
      return `${digits(nepali.year, "devanagari")}/${digits(nepali.month, "devanagari", 2)}/${digits(nepali.day, "devanagari", 2)}`;
    case "bsLatin":
      return `${nepali.year}/${digits(nepali.month, "latin", 2)}/${digits(nepali.day, "latin", 2)}`;
    case "ad": {
      const [y, m, d] = gregorian.split("-").map(Number);
      if (!y || !m || !d) return gregorian;
      return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      });
    }
  }
}
