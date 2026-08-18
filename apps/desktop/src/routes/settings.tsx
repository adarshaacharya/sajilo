import { useEffect, useState, type ReactNode } from "react";
import { Card } from "../components/Card";
import { ICONS } from "../components/Icon";
import { Segmented } from "../components/Segmented";
import { Select } from "../components/Select";
import { Toggle } from "../components/Toggle";
import type { Language } from "../lib/i18n";
import {
  api,
  type NotificationOptions,
  type PermissionState,
} from "../lib/ipc";
import { digits, type NumeralStyle } from "../lib/numerals";
import { FOREX_OPTIONS, useSettings } from "../lib/settings";

type Tab = "display" | "modules" | "system";

const MENU_BAR_FORMATS = [
  "nepaliShort",
  "nepaliLong",
  "nepaliFlag",
  "englishShort",
  "numeric",
  "custom",
] as const;

/** Each label previews the shape it produces, since the option ids say nothing
 * about what lands in the menu bar. */
const MENU_BAR_FORMAT_LABELS: Record<(typeof MENU_BAR_FORMATS)[number], string> = {
  nepaliShort: "Short — साउन ३१",
  nepaliLong: "Full — साउन ३१, २०८३",
  nepaliFlag: "With flag — 🇳🇵 साउन ३१",
  englishShort: "Gregorian — Aug 16",
  numeric: "Numeric — २०८३/०४/३१",
  custom: "Custom…",
};

export function Settings() {
  const { t, language, setLanguage, numerals, setNumerals } = useSettings();
  const [tab, setTab] = useState<Tab>("display");

  return (
    <div className="space-y-3">
      <Segmented
        label={t("settings.general")}
        value={tab}
        onChange={setTab}
        options={[
          { id: "display" as const, label: t("settings.tab-display"), icon: ICONS.display },
          { id: "modules" as const, label: t("settings.tab-modules"), icon: ICONS.modules },
          { id: "system" as const, label: t("settings.tab-system"), icon: ICONS.system },
        ]}
      />

      {tab === "display" && (
        <DisplayTab
          language={language}
          setLanguage={setLanguage}
          numerals={numerals}
          setNumerals={setNumerals}
        />
      )}
      {tab === "modules" && <ModulesTab />}
      {tab === "system" && <SystemTab />}
    </div>
  );
}

/** Label + control on one row — closer to Swift SettingsSection pickers. */
function SettingsRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
      <span className="w-[88px] shrink-0 text-[12px] text-text-secondary">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function DisplayTab({
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
  const { t } = useSettings();
  const [format, setFormat] = useState<string>("nepaliLong");
  const [showFlag, setShowFlag] = useState(true);
  const [showYear, setShowYear] = useState(true);

  useEffect(() => {
    import("@tauri-apps/plugin-store")
      .then(({ load }) => load("sajilo.json", { autoSave: true }))
      .then(async (store) => {
        const saved = await store.get<string>("menuBarFormat");
        if (saved) setFormat(saved);
        const flag = await store.get<boolean>("customMenuBarShowsFlag");
        if (flag !== undefined) setShowFlag(flag);
        const year = await store.get<boolean>("customMenuBarShowsYear");
        if (year !== undefined) setShowYear(year);
      })
      .catch(() => {});
  }, []);

  const persistFormat = (next: string) => {
    setFormat(next);
    import("@tauri-apps/plugin-store")
      .then(({ load }) => load("sajilo.json", { autoSave: true }))
      .then((store) => store.set("menuBarFormat", next))
      .then(() => api.refreshTray())
      .catch(() => {});
  };

  const persistCustom = (key: "customMenuBarShowsFlag" | "customMenuBarShowsYear", value: boolean) => {
    import("@tauri-apps/plugin-store")
      .then(({ load }) => load("sajilo.json", { autoSave: true }))
      .then((store) => store.set(key, value))
      .then(() => api.refreshTray())
      .catch(() => {});
  };

  return (
    <>
      <Card title={t("settings.appearance")}>
        <SettingsRow label={t("settings.language")}>
          <Select
            value={language}
            onChange={setLanguage}
            options={[
              { id: "ne", label: t("language.nepali") },
              { id: "en", label: t("language.english") },
            ]}
          />
        </SettingsRow>
        <div className="border-t border-border/50" />
        <SettingsRow label={t("settings.numerals")}>
          <Select
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
        </SettingsRow>
      </Card>

      <Card title={t("settings.menu-bar")}>
        <SettingsRow label={t("settings.format")}>
          <Select
            value={format}
            onChange={persistFormat}
            options={MENU_BAR_FORMATS.map((id) => ({ id, label: MENU_BAR_FORMAT_LABELS[id] }))}
          />
        </SettingsRow>
        {format === "custom" && (
          <>
            <div className="border-t border-border/50" />
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
      </Card>
    </>
  );
}

function ModulesTab() {
  const { t, modules, setModules } = useSettings();

  const rows = [
    {
      key: "weatherEnabled" as const,
      label: t("feature.weather"),
      note: t("settings.module-weather-note"),
      extra: (
        <Select
          label={t("settings.weather-location")}
          value={modules.weatherLocation}
          onChange={(next) =>
            setModules((current) => ({
              ...current,
              weatherLocation: next as typeof modules.weatherLocation,
            }))
          }
          options={[
            { id: "kathmandu", label: "Kathmandu · काठमाडौं" },
            { id: "pokhara", label: "Pokhara · पोखरा" },
            { id: "lalitpur", label: "Lalitpur · ललितपुर" },
          ]}
        />
      ),
    },
    {
      key: "forexEnabled" as const,
      label: t("feature.forex"),
      note: t("settings.module-forex-note"),
      extra: (
        <div className="flex flex-wrap gap-1 pt-1">
          {FOREX_OPTIONS.map((code) => {
            const on = modules.forexFavourites.includes(code);
            return (
              <button
                key={code}
                type="button"
                onClick={() =>
                  setModules((current) => ({
                    ...current,
                    forexFavourites: on
                      ? current.forexFavourites.filter((item) => item !== code)
                      : [...current.forexFavourites, code],
                  }))
                }
                className={`rounded-md border px-1.5 py-0.5 text-[10px] ${
                  on
                    ? "border-accent text-accent"
                    : "border-border text-text-muted hover:bg-surface-hover"
                }`}
              >
                {code}
              </button>
            );
          })}
        </div>
      ),
    },
    { key: "newsEnabled" as const, label: t("screen.news"), note: t("settings.module-news-note") },
    { key: "bazarEnabled" as const, label: t("screen.bazar"), note: t("settings.module-bazar-note") },
    {
      key: "rashifalEnabled" as const,
      label: t("screen.rashifal"),
      note: t("settings.module-rashifal-note"),
    },
    { key: "radioEnabled" as const, label: t("screen.radio"), note: t("settings.module-radio-note") },
  ];

  const noneOn =
    !modules.weatherEnabled &&
    !modules.forexEnabled &&
    !modules.newsEnabled &&
    !modules.bazarEnabled &&
    !modules.rashifalEnabled &&
    !modules.radioEnabled;

  return (
    <Card title={t("settings.modules")}>
      {rows.map((row) => (
        <div key={row.key} className="border-b border-border/50 py-2 last:border-0 last:pb-0 first:pt-0">
          <Toggle
            label={row.label}
            note={row.note}
            checked={modules[row.key]}
            onChange={(value) => setModules((current) => ({ ...current, [row.key]: value }))}
          />
          {modules[row.key] && row.extra}
        </div>
      ))}
      {noneOn && (
        <p className="mt-1 text-[11px] text-text-muted">{t("settings.nothing-enabled")}</p>
      )}
    </Card>
  );
}

function SystemTab() {
  const { t } = useSettings();
  const [autostart, setAutostart] = useState(false);
  const [dockIcon, setDockIcon] = useState(false);
  const [options, setOptions] = useState<NotificationOptions>({
    eveOfPublicHoliday: false,
    eveOfFestival: false,
    hour: 19,
  });
  const [permission, setPermission] = useState<PermissionState>("unknown");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api
      .isAutostartEnabled()
      .then(setAutostart)
      .catch(() => {});
    api
      .getNotificationOptions()
      .then(setOptions)
      .catch(() => {});
    api
      .notificationPermission()
      .then(setPermission)
      .catch(() => {});
  }, []);

  const updateOptions = async (next: NotificationOptions) => {
    if ((next.eveOfFestival || next.eveOfPublicHoliday) && permission !== "granted") {
      setPermission(await api.requestNotificationPermission().catch(() => "denied" as const));
    }
    setOptions(next);
    await api.setNotificationOptions(next).catch(() => {});
  };

  const exportData = async () => {
    const contents = await api.exportBackup();
    const { save } = await import("@tauri-apps/plugin-dialog");
    const path = await save({
      defaultPath: "sajilo-backup.json",
      filters: [{ name: "Sajilo backup", extensions: ["json"] }],
    });
    if (!path) return;
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    await writeTextFile(path, contents);
    setMessage(t("settings.export-data"));
  };

  const importData = async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({
      multiple: false,
      filters: [{ name: "Sajilo backup", extensions: ["json"] }],
    });
    if (typeof path !== "string") return;
    const { readTextFile } = await import("@tauri-apps/plugin-fs");
    const summary = await api.importBackup(await readTextFile(path));
    setMessage(`${t("settings.backup-imported")} (${summary.dayPlans})`);
  };

  return (
    <>
      <Card title={t("settings.reminders")}>
        <Toggle
          label={t("reminder.festival-tomorrow")}
          checked={options.eveOfFestival}
          onChange={(value) => updateOptions({ ...options, eveOfFestival: value })}
        />
        <Toggle
          label={t("reminder.holiday-tomorrow")}
          checked={options.eveOfPublicHoliday}
          onChange={(value) => updateOptions({ ...options, eveOfPublicHoliday: value })}
        />
        <p className="mt-1 text-[11px] text-text-muted">
          {permission === "denied"
            ? t("settings.reminder-denied-note")
            : options.eveOfFestival || options.eveOfPublicHoliday
              ? t("settings.reminder-enabled-note")
              : t("settings.reminder-off-note")}
        </p>
      </Card>

      <Card title={t("settings.startup")}>
        <Toggle
          label={t("settings.launch-at-login")}
          checked={autostart}
          onChange={async (value) => {
            setAutostart(await api.setAutostart(value).catch(() => autostart));
          }}
        />
        <Toggle
          label={t("settings.show-dock-icon")}
          checked={dockIcon}
          onChange={(value) => {
            setDockIcon(value);
            api.setDockIconVisible(value).catch(() => {});
          }}
        />
      </Card>

      <Card title={t("settings.backup")}>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => exportData().catch((error) => setMessage(String(error)))}
            className="flex-1 rounded-md border border-border py-1.5 text-text-secondary hover:bg-surface-hover hover:text-text"
          >
            {t("settings.export-data")}
          </button>
          <button
            type="button"
            onClick={() => importData().catch((error) => setMessage(String(error)))}
            className="flex-1 rounded-md border border-border py-1.5 text-text-secondary hover:bg-surface-hover hover:text-text"
          >
            {t("settings.import-data")}
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-text-muted">{t("settings.backup-note")}</p>
        {message && <p className="mt-1 text-[11px] text-positive">{message}</p>}
      </Card>
    </>
  );
}
