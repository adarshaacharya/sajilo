import en from "../../i18n/en.json";
import ne from "../../i18n/ne.json";

export type Language = "en" | "ne";
type Key = keyof typeof en;

const TABLES: Record<Language, Record<string, string>> = { en, ne };

/**
 * Falls back to English, then to the key itself. A missing translation should
 * show an English word, never a blank space where a label belongs.
 */
export function translate(key: Key, language: Language): string {
  return TABLES[language][key] ?? en[key] ?? key;
}
