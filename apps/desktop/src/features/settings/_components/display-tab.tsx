import { useEffect, useState } from "react";
import { Select } from "../../../shared/components/select";
import { Toggle } from "../../../shared/components/toggle";
import { type ThemeMode, useSettings } from "../../../shared/context/settings-context";
import type { Language } from "../../../shared/lib/i18n";
import { api } from "../../../shared/lib/ipc";
import { digits, type NumeralStyle } from "../../../shared/lib/numerals";
import { SettingsSection } from "./settings-section";

const MENU_BAR_FORMATS = [
  "nepaliShort",
  "nepaliLong",
  "nepaliFlag",
  "englishShort",
  "numeric",
  "custom",
] as const;

const MENU_BAR_FORMAT_LABELS: Record<(typeof MENU_BAR_FORMATS)[number], string> = {
  nepaliShort: "Short — साउन ३१",
  nepaliLong: "Full — साउन ३१, २०८३",
  nepaliFlag: "With flag — 🇳🇵 साउन ३१",
  englishShort: "Gregorian — Aug 16",
  numeric: "Numeric — २०८३/०४/३१",
  custom: "Custom…",
};

export function DisplayTab({
  language,
  setLanguage,
  numerals,
  setNumerals,
}: {
  language: Language;
  setLanguage: (value: Language) => void;
  numerals: NumeralStyle;
  setNumerals: (value: NumeralStyle) => void;
}) {
  const { t, theme, setTheme } = useSettings();
  const [format, setFormat] = useState<string>("nepaliLong");
  const [showFlag, setShowFlag] = useState(true);
  const [showYear, setShowYear] = useState(true);
  const [showTime, setShowTime] = useState(false);

  useEffect(() => {
    Promise.all([
      api.getSetting<string>("menuBarFormat"),
      api.getSetting<boolean>("customMenuBarShowsFlag"),
      api.getSetting<boolean>("customMenuBarShowsYear"),
      api.getSetting<boolean>("showTrayTime"),
    ])
      .then(([saved, flag, year, time]) => {
        if (saved) setFormat(saved);
        if (flag !== null) setShowFlag(flag);
        if (year !== null) setShowYear(year);
        if (time !== null) setShowTime(time);
      })
      .catch(() => {});
  }, []);

  const persistFormat = (next: string) => {
    setFormat(next);
    api
      .setSetting("menuBarFormat", next)
      .then(() => api.refreshTray())
      .catch(() => {});
  };

  const persistCustom = (
    key: "customMenuBarShowsFlag" | "customMenuBarShowsYear" | "showTrayTime",
    value: boolean,
  ) => {
    api
      .setSetting(key, value)
      .then(() => api.refreshTray())
      .catch(() => {});
  };

  return (
    <div className="space-y-2.5">
      <SettingsSection title={t("settings.appearance")}>
        <Select
          label={t("settings.theme")}
          value={theme}
          onChange={(value) => setTheme(value as ThemeMode)}
          options={[
            { id: "system", label: t("theme.system") },
            { id: "light", label: t("theme.light") },
            { id: "dark", label: t("theme.dark") },
          ]}
        />
        <Select
          label={t("settings.language")}
          value={language}
          onChange={setLanguage}
          options={[
            { id: "ne", label: t("language.nepali") },
            { id: "en", label: t("language.english") },
          ]}
        />
        <Select
          label={t("settings.numerals")}
          value={numerals}
          onChange={setNumerals}
          options={[
            {
              id: "devanagari",
              label: `${t("numerals.devanagari")} · ${digits(2083, "devanagari")}`,
            },
            { id: "latin", label: `${t("numerals.latin")} · ${digits(2083, "latin")}` },
          ]}
        />
      </SettingsSection>

      <SettingsSection title={t("settings.menu-bar")}>
        <Select
          label={t("settings.format")}
          value={format}
          onChange={persistFormat}
          options={MENU_BAR_FORMATS.map((id) => ({ id, label: MENU_BAR_FORMAT_LABELS[id] }))}
        />
        <Toggle
          label={t("settings.menu-bar-show-time")}
          checked={showTime}
          onChange={(value) => {
            setShowTime(value);
            persistCustom("showTrayTime", value);
          }}
        />
        {format === "custom" && (
          <>
            <Toggle
              label={t("settings.menu-bar-show-flag")}
              checked={showFlag}
              onChange={(value) => {
                setShowFlag(value);
                persistCustom("customMenuBarShowsFlag", value);
              }}
            />
            <Toggle
              label={t("settings.menu-bar-show-year")}
              checked={showYear}
              onChange={(value) => {
                setShowYear(value);
                persistCustom("customMenuBarShowsYear", value);
              }}
            />
          </>
        )}
      </SettingsSection>
    </div>
  );
}
