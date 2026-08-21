import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import type { WeatherLocation } from "../../types/api/WeatherLocation";
import type { Language } from "../lib/i18n";
import { translate } from "../lib/i18n";
import { api } from "../lib/ipc";
import type { NumeralStyle } from "../lib/numerals";

export type ThemeMode = "system" | "light" | "dark";

export interface ModulePrefs {
  weatherEnabled: boolean;
  forexEnabled: boolean;
  newsEnabled: boolean;
  bazarEnabled: boolean;
  rashifalEnabled: boolean;
  radioEnabled: boolean;
  weatherLocation: WeatherLocation;
  forexFavourites: string[];
  clocksEnabled: boolean;
  /** IANA timezones, in the order they were added — the dashboard preview
   * shows the first few in this order. */
  clocks: string[];
  samjhanaEnabled: boolean;
}

const DEFAULT_MODULES: ModulePrefs = {
  weatherEnabled: true,
  forexEnabled: true,
  newsEnabled: true,
  bazarEnabled: true,
  rashifalEnabled: true,
  radioEnabled: true,
  weatherLocation: "kathmandu",
  forexFavourites: ["USD", "AUD", "GBP", "EUR", "JPY"],
  clocksEnabled: false,
  clocks: [],
  samjhanaEnabled: true,
};

const FOREX_OPTIONS = ["USD", "AUD", "GBP", "EUR", "JPY", "INR", "CNY", "SAR", "QAR", "SGD"];

interface Settings {
  language: Language;
  numerals: NumeralStyle;
  theme: ThemeMode;
  modules: ModulePrefs;
  setLanguage: (value: Language) => void;
  setNumerals: (value: NumeralStyle) => void;
  setTheme: (value: ThemeMode) => void;
  setModules: (value: ModulePrefs | ((current: ModulePrefs) => ModulePrefs)) => void;
  t: (key: Parameters<typeof translate>[0]) => string;
}

const SettingsContext = createContext<Settings | null>(null);

function applyTheme(theme: ThemeMode) {
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

/**
 * Injected once at the popover root rather than threaded through every screen,
 * since almost every surface renders a date.
 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>("ne");
  const [numerals, setNumerals] = useState<NumeralStyle>("devanagari");
  const [theme, setThemeState] = useState<ThemeMode>("system");
  const [modules, setModulesState] = useState<ModulePrefs>(DEFAULT_MODULES);

  useEffect(() => applyTheme(theme), [theme]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.getSetting<Language>("language"),
      api.getSetting<NumeralStyle>("numeralStyle"),
      api.getSetting<ThemeMode>("theme"),
      api.getSetting<boolean>("weatherEnabled"),
      api.getSetting<boolean>("forexEnabled"),
      api.getSetting<boolean>("newsEnabled"),
      api.getSetting<boolean>("bazarEnabled"),
      api.getSetting<boolean>("rashifalEnabled"),
      api.getSetting<boolean>("radioEnabled"),
      api.getSetting<WeatherLocation>("weatherLocation"),
      api.getSetting<string[]>("forexFavourites"),
      api.getSetting<boolean>("clocksEnabled"),
      api.getSetting<string[]>("clocks"),
      api.getSetting<boolean>("samjhanaEnabled"),
    ])
      .then(
        ([
          storedLanguage,
          storedNumerals,
          storedTheme,
          weatherEnabled,
          forexEnabled,
          newsEnabled,
          bazarEnabled,
          rashifalEnabled,
          radioEnabled,
          weatherLocation,
          forexFavourites,
          clocksEnabled,
          clocks,
          samjhanaEnabled,
        ]) => {
          if (cancelled) return;
          if (storedLanguage) setLanguage(storedLanguage);
          if (storedNumerals) setNumerals(storedNumerals);
          if (storedTheme === "system" || storedTheme === "light" || storedTheme === "dark") {
            setThemeState(storedTheme);
          }
          setModulesState((current) => ({
            ...current,
            ...(weatherEnabled !== null && { weatherEnabled }),
            ...(forexEnabled !== null && { forexEnabled }),
            ...(newsEnabled !== null && { newsEnabled }),
            ...(bazarEnabled !== null && { bazarEnabled }),
            ...(rashifalEnabled !== null && { rashifalEnabled }),
            ...(radioEnabled !== null && { radioEnabled }),
            ...(weatherLocation && { weatherLocation }),
            ...(forexFavourites && { forexFavourites }),
            ...(clocksEnabled !== null && { clocksEnabled }),
            ...(clocks && { clocks }),
            ...(samjhanaEnabled !== null && { samjhanaEnabled }),
          }));
        },
      )
      .catch(() => {
        /* Not under Tauri: the defaults above stand. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback((key: string, value: unknown) => {
    api
      .setSetting(key, value)
      .then(() => api.refreshTray())
      .catch(() => {});
  }, []);

  const setModules = useCallback(
    (value: ModulePrefs | ((current: ModulePrefs) => ModulePrefs)) => {
      setModulesState((current) => {
        const next = typeof value === "function" ? value(current) : value;
        persist("weatherEnabled", next.weatherEnabled);
        persist("forexEnabled", next.forexEnabled);
        persist("newsEnabled", next.newsEnabled);
        persist("bazarEnabled", next.bazarEnabled);
        persist("rashifalEnabled", next.rashifalEnabled);
        persist("radioEnabled", next.radioEnabled);
        persist("weatherLocation", next.weatherLocation);
        persist("forexFavourites", next.forexFavourites);
        persist("clocksEnabled", next.clocksEnabled);
        persist("clocks", next.clocks);
        persist("samjhanaEnabled", next.samjhanaEnabled);
        return next;
      });
    },
    [persist],
  );

  const value: Settings = {
    language,
    numerals,
    theme,
    modules,
    setLanguage: (next) => {
      setLanguage(next);
      persist("language", next);
    },
    setNumerals: (next) => {
      setNumerals(next);
      persist("numeralStyle", next);
    },
    setTheme: (next) => {
      setThemeState(next);
      persist("theme", next);
    },
    setModules,
    t: (key) => translate(key, language),
  };

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): Settings {
  const value = useContext(SettingsContext);
  if (!value) throw new Error("useSettings must be used inside SettingsProvider");
  return value;
}

export { FOREX_OPTIONS };
