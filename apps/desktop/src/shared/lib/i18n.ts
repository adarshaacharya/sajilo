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

/**
 * The chosen language, mirrored outside React.
 *
 * `useSettings` throws when it is called outside the provider, and the
 * outermost error boundary sits above that provider by design — it has to
 * survive the provider itself failing. That boundary still has to speak the
 * user's language, so the setting is mirrored here and read directly. Anything
 * that can reach the context should keep using `t` from `useSettings`.
 */
let activeLanguage: Language = "ne";

export function setActiveLanguage(language: Language): void {
  activeLanguage = language;
}

export function translateStatic(key: Key): string {
  return translate(key, activeLanguage);
}
