import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import type { Language } from "../lib/i18n";
import { setActiveLanguage, systemLanguage, translate } from "../lib/i18n";
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
  /** The home place (a place id): shown on the home screen and in the tray.
   * Always the first of `weatherPins`; kept on its own for what reads it
   * without knowing about pins — the tray, backups. */
  weatherLocation: string;
  /** Every pinned place, home first. */
  weatherPins: string[];
  forexFavourites: string[];
  clocksEnabled: boolean;
  /** IANA timezones, in the order they were added — the dashboard preview
   * shows the first few in this order. */
  clocks: string[];
  keeperEnabled: boolean;
}

const DEFAULT_MODULES: ModulePrefs = {
  weatherEnabled: true,
  forexEnabled: true,
  newsEnabled: true,
  bazarEnabled: true,
  rashifalEnabled: true,
  radioEnabled: true,
  weatherLocation: "kathmandu",
  weatherPins: ["kathmandu"],
  forexFavourites: ["USD", "AUD", "GBP", "EUR", "JPY"],
  clocksEnabled: false,
  clocks: [],
  keeperEnabled: true,
};

/** Keeps the home place and the pin list agreeing: the home place is the first
 * pin, and there is always at least one. */
function withHomePlace(modules: ModulePrefs): ModulePrefs {
  const pins = modules.weatherPins.length > 0 ? modules.weatherPins : [modules.weatherLocation];
  return { ...modules, weatherPins: pins, weatherLocation: pins[0] ?? "kathmandu" };
}

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
  const [language, setLanguage] = useState<Language>(systemLanguage);
  const [numerals, setNumerals] = useState<NumeralStyle>("devanagari");
  const [theme, setThemeState] = useState<ThemeMode>("system");
  const [modules, setModulesState] = useState<ModulePrefs>(DEFAULT_MODULES);

  useEffect(() => applyTheme(theme), [theme]);

  // Mirrored for the outermost error boundary, which renders above this
  // provider and so cannot read the context.
  useEffect(() => setActiveLanguage(language), [language]);

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
      api.getSetting<string>("weatherLocation"),
      api.getSetting<string[]>("weatherPins"),
      api.getSetting<string[]>("forexFavourites"),
      api.getSetting<boolean>("clocksEnabled"),
      api.getSetting<string[]>("clocks"),
      api.getSetting<boolean>("keeperEnabled"),
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
          weatherPins,
          forexFavourites,
          clocksEnabled,
          clocks,
          keeperEnabled,
        ]) => {
          if (cancelled) return;
          if (storedLanguage) setLanguage(storedLanguage);
          if (storedNumerals) setNumerals(storedNumerals);
          if (storedTheme === "system" || storedTheme === "light" || storedTheme === "dark") {
            setThemeState(storedTheme);
          }
          setModulesState((current) =>
            withHomePlace({
              ...current,
              ...(weatherEnabled !== null && { weatherEnabled }),
              ...(forexEnabled !== null && { forexEnabled }),
              ...(newsEnabled !== null && { newsEnabled }),
              ...(bazarEnabled !== null && { bazarEnabled }),
              ...(rashifalEnabled !== null && { rashifalEnabled }),
              ...(radioEnabled !== null && { radioEnabled }),
              // A city picked before pins existed becomes the only pin.
              ...(weatherLocation && { weatherLocation, weatherPins: [weatherLocation] }),
              ...(Array.isArray(weatherPins) && weatherPins.length > 0 && { weatherPins }),
              ...(forexFavourites && { forexFavourites }),
              // Cities saved before the module switch existed: having picked one
              // is the opt-in. Only an explicitly stored `false` keeps the row
              // hidden, so turning it off in Settings still sticks.
              ...(clocksEnabled !== null
                ? { clocksEnabled }
                : clocks && clocks.length > 0
                  ? { clocksEnabled: true }
                  : {}),
              ...(clocks && { clocks }),
              ...(keeperEnabled !== null && { keeperEnabled }),
            }),
          );
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
        const next = withHomePlace(typeof value === "function" ? value(current) : value);
        persist("weatherEnabled", next.weatherEnabled);
        persist("forexEnabled", next.forexEnabled);
        persist("newsEnabled", next.newsEnabled);
        persist("bazarEnabled", next.bazarEnabled);
        persist("rashifalEnabled", next.rashifalEnabled);
        persist("radioEnabled", next.radioEnabled);
        persist("weatherLocation", next.weatherLocation);
        persist("weatherPins", next.weatherPins);
        persist("forexFavourites", next.forexFavourites);
        persist("clocksEnabled", next.clocksEnabled);
        persist("clocks", next.clocks);
        persist("keeperEnabled", next.keeperEnabled);
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
