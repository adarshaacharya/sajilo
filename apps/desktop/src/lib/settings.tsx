import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import type { Language } from "./i18n";
import { translate } from "./i18n";
import type { NumeralStyle } from "./numerals";

interface Settings {
  language: Language;
  numerals: NumeralStyle;
  setLanguage: (value: Language) => void;
  setNumerals: (value: NumeralStyle) => void;
  t: (key: Parameters<typeof translate>[0]) => string;
}

const SettingsContext = createContext<Settings | null>(null);

/**
 * Injected once at the popover root rather than threaded through every screen,
 * since almost every surface renders a date.
 *
 * Written through to the Tauri store because the tray is built before any
 * webview exists and reads these same keys to draw its label.
 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>("ne");
  const [numerals, setNumerals] = useState<NumeralStyle>("devanagari");

  useEffect(() => {
    let cancelled = false;
    import("@tauri-apps/plugin-store")
      .then(({ load }) => load("sajilo.json", { autoSave: true }))
      .then(async (store) => {
        const [storedLanguage, storedNumerals] = await Promise.all([
          store.get<Language>("language"),
          store.get<NumeralStyle>("numeralStyle"),
        ]);
        if (cancelled) return;
        if (storedLanguage) setLanguage(storedLanguage);
        if (storedNumerals) setNumerals(storedNumerals);
      })
      .catch(() => {
        /* Not under Tauri: the defaults above stand. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = (key: string, value: string) => {
    import("@tauri-apps/plugin-store")
      .then(({ load }) => load("sajilo.json", { autoSave: true }))
      .then((store) => store.set(key, value))
      .catch(() => {});
  };

  const value: Settings = {
    language,
    numerals,
    setLanguage: (next) => {
      setLanguage(next);
      persist("language", next);
    },
    setNumerals: (next) => {
      setNumerals(next);
      persist("numeralStyle", next);
    },
    t: (key) => translate(key, language),
  };

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): Settings {
  const value = useContext(SettingsContext);
  if (!value) throw new Error("useSettings must be used inside SettingsProvider");
  return value;
}
