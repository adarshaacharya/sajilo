import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import type { WeatherLocation } from "../../types/api/WeatherLocation";
import type { Language } from "../lib/i18n";
import { translate } from "../lib/i18n";
import { api } from "../lib/ipc";
import type { NumeralStyle } from "../lib/numerals";

export interface ModulePrefs {
  weatherEnabled: boolean;
  forexEnabled: boolean;
  newsEnabled: boolean;
  bazarEnabled: boolean;
  rashifalEnabled: boolean;
  radioEnabled: boolean;
  weatherLocation: WeatherLocation;
  forexFavourites: string[];
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
};

const FOREX_OPTIONS = ["USD", "AUD", "GBP", "EUR", "JPY", "INR", "CNY", "SAR", "QAR", "SGD"];

interface Settings {
  language: Language;
  numerals: NumeralStyle;
  modules: ModulePrefs;
  setLanguage: (value: Language) => void;
  setNumerals: (value: NumeralStyle) => void;
  setModules: (value: ModulePrefs | ((current: ModulePrefs) => ModulePrefs)) => void;
  t: (key: Parameters<typeof translate>[0]) => string;
}

const SettingsContext = createContext<Settings | null>(null);

async function loadStore() {
  const { load } = await import("@tauri-apps/plugin-store");
  return load("sajilo.json", { autoSave: true });
}

/**
 * Injected once at the popover root rather than threaded through every screen,
 * since almost every surface renders a date.
 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>("ne");
  const [numerals, setNumerals] = useState<NumeralStyle>("devanagari");
  const [modules, setModulesState] = useState<ModulePrefs>(DEFAULT_MODULES);

  useEffect(() => {
    let cancelled = false;
    loadStore()
      .then(async (store) => {
        const [
          storedLanguage,
          storedNumerals,
          weatherEnabled,
          forexEnabled,
          newsEnabled,
          bazarEnabled,
          rashifalEnabled,
          radioEnabled,
          weatherLocation,
          forexFavourites,
        ] = await Promise.all([
          store.get<Language>("language"),
          store.get<NumeralStyle>("numeralStyle"),
          store.get<boolean>("weatherEnabled"),
          store.get<boolean>("forexEnabled"),
          store.get<boolean>("newsEnabled"),
          store.get<boolean>("bazarEnabled"),
          store.get<boolean>("rashifalEnabled"),
          store.get<boolean>("radioEnabled"),
          store.get<WeatherLocation>("weatherLocation"),
          store.get<string[]>("forexFavourites"),
        ]);
        if (cancelled) return;
        if (storedLanguage) setLanguage(storedLanguage);
        if (storedNumerals) setNumerals(storedNumerals);
        setModulesState((current) => ({
          ...current,
          ...(weatherEnabled !== undefined && { weatherEnabled }),
          ...(forexEnabled !== undefined && { forexEnabled }),
          ...(newsEnabled !== undefined && { newsEnabled }),
          ...(bazarEnabled !== undefined && { bazarEnabled }),
          ...(rashifalEnabled !== undefined && { rashifalEnabled }),
          ...(radioEnabled !== undefined && { radioEnabled }),
          ...(weatherLocation && { weatherLocation }),
          ...(forexFavourites && { forexFavourites }),
        }));
      })
      .catch(() => {
        /* Not under Tauri: the defaults above stand. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback((key: string, value: unknown) => {
    loadStore()
      .then((store) => store.set(key, value))
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
        return next;
      });
    },
    [persist],
  );

  const value: Settings = {
    language,
    numerals,
    modules,
    setLanguage: (next) => {
      setLanguage(next);
      persist("language", next);
    },
    setNumerals: (next) => {
      setNumerals(next);
      persist("numeralStyle", next);
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
