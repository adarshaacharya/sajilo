import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { Segmented } from "../components/Segmented";
import { Select } from "../components/Select";
import { CurrencyPicker } from "../components/settings/CurrencyPicker";
import { ModuleRow } from "../components/settings/ModuleRow";
import { SettingsSection } from "../components/settings/SettingsSection";
import { Toggle } from "../components/Toggle";
import type { Language } from "../lib/i18n";
import { api, type NotificationOptions, type PermissionState } from "../lib/ipc";
import { digits, type NumeralStyle } from "../lib/numerals";
import { useSettings } from "../lib/settings";

type Tab = "display" | "modules" | "system";

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

export function Settings() {
  const { t, language, setLanguage, numerals, setNumerals } = useSettings();
  const [tab, setTab] = useState<Tab>("display");

  return (
    <div className="space-y-2.5">
      <Segmented
        label={t("settings.general")}
        value={tab}
        onChange={setTab}
        options={[
          { id: "display" as const, label: t("settings.tab-display"), icon: "display" as const },
          { id: "modules" as const, label: t("settings.tab-modules"), icon: "modules" as const },
          { id: "system" as const, label: t("settings.tab-system"), icon: "system" as const },
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

  const persistCustom = (
    key: "customMenuBarShowsFlag" | "customMenuBarShowsYear",
    value: boolean,
  ) => {
    import("@tauri-apps/plugin-store")
      .then(({ load }) => load("sajilo.json", { autoSave: true }))
      .then((store) => store.set(key, value))
      .then(() => api.refreshTray())
      .catch(() => {});
  };

  return (
    <div className="space-y-2.5">
      <SettingsSection title={t("settings.appearance")}>
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

function ModulesTab() {
  const { t, modules, setModules } = useSettings();

  const toggleForex = (code: string) => {
    setModules((current) => ({
      ...current,
      forexFavourites: current.forexFavourites.includes(code)
        ? current.forexFavourites.filter((item) => item !== code)
        : [...current.forexFavourites, code],
    }));
  };

  const noneOn =
    !modules.weatherEnabled &&
    !modules.forexEnabled &&
    !modules.newsEnabled &&
    !modules.bazarEnabled &&
    !modules.rashifalEnabled &&
    !modules.radioEnabled;

  return (
    <div className="space-y-1.5">
      <ModuleRow
        title={t("feature.weather")}
        note={t("settings.module-weather-note")}
        icon="weather"
        checked={modules.weatherEnabled}
        onChange={(value) => setModules((current) => ({ ...current, weatherEnabled: value }))}
      >
        <Select
          label={t("settings.city")}
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
      </ModuleRow>

      <ModuleRow
        title={t("feature.forex")}
        note={t("settings.module-forex-note")}
        icon="forex"
        checked={modules.forexEnabled}
        onChange={(value) => setModules((current) => ({ ...current, forexEnabled: value }))}
      >
        <CurrencyPicker
          title={t("settings.currencies")}
          hint={t("settings.currencies-hint")}
          selected={modules.forexFavourites}
          onToggle={toggleForex}
        />
      </ModuleRow>

      <ModuleRow
        title={t("screen.news")}
        note={t("settings.module-news-note")}
        icon="news"
        checked={modules.newsEnabled}
        onChange={(value) => setModules((current) => ({ ...current, newsEnabled: value }))}
      />

      <ModuleRow
        title={t("screen.bazar")}
        note={t("settings.module-bazar-note")}
        icon="bazar"
        checked={modules.bazarEnabled}
        onChange={(value) => setModules((current) => ({ ...current, bazarEnabled: value }))}
      />

      <ModuleRow
        title={t("screen.rashifal")}
        note={t("settings.module-rashifal-note")}
        icon="rashifal"
        checked={modules.rashifalEnabled}
        onChange={(value) => setModules((current) => ({ ...current, rashifalEnabled: value }))}
      />

      <ModuleRow
        title={t("screen.radio")}
        note={t("settings.module-radio-note")}
        icon="radio"
        checked={modules.radioEnabled}
        onChange={(value) => setModules((current) => ({ ...current, radioEnabled: value }))}
      />

      {noneOn && (
        <p className="px-0.5 text-[10px] text-text-muted">{t("settings.nothing-enabled")}</p>
      )}
    </div>
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
  const [updaterEnabled, setUpdaterEnabled] = useState(false);
  const [updateState, setUpdateState] = useState<
    "idle" | "checking" | "up-to-date" | "downloading" | "installed" | "failed"
  >("idle");
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);

  useEffect(() => {
    api
      .isAutostartEnabled()
      .then(setAutostart)
      .catch(() => {});
    api
      .isDockIconVisible()
      .then(setDockIcon)
      .catch(() => {});
    api
      .updaterEnabled()
      .then(setUpdaterEnabled)
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

  const reminderNote =
    permission === "denied"
      ? t("settings.reminder-denied-note")
      : options.eveOfFestival || options.eveOfPublicHoliday
        ? t("settings.reminder-enabled-note")
        : t("settings.reminder-off-note");

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

  const checkForUpdates = async () => {
    setUpdateState("checking");
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (!update) {
        setUpdateState("up-to-date");
        return;
      }
      setUpdateVersion(update.version);
      setUpdateState("downloading");
      await update.downloadAndInstall();
      setUpdateState("installed");
    } catch {
      setUpdateState("failed");
    }
  };

  const restartToUpdate = async () => {
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  };

  const updateNote = {
    idle: null,
    checking: t("settings.update-checking"),
    "up-to-date": t("settings.update-up-to-date"),
    downloading: updateVersion
      ? `${t("settings.update-available")} ${updateVersion}…`
      : t("settings.update-checking"),
    installed: t("settings.update-installed"),
    failed: t("settings.update-failed"),
  }[updateState];

  return (
    <div className="space-y-2.5">
      <SettingsSection title={t("settings.startup")}>
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
      </SettingsSection>

      {updaterEnabled && (
        <SettingsSection title={t("settings.updates")} footnote={updateNote ?? undefined}>
          {updateState === "installed" ? (
            <button type="button" onClick={() => restartToUpdate()} className="settings-btn">
              <Icon name="refresh" className="size-3 shrink-0" />
              {t("settings.update-restart")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => checkForUpdates()}
              disabled={updateState === "checking" || updateState === "downloading"}
              className="settings-btn"
            >
              <Icon name="refresh" className="size-3 shrink-0" />
              {t("settings.check-for-updates")}
            </button>
          )}
        </SettingsSection>
      )}

      <SettingsSection title={t("settings.reminders")} footnote={reminderNote}>
        <Toggle
          label={t("reminder.holiday-tomorrow")}
          checked={options.eveOfPublicHoliday}
          onChange={(value) => updateOptions({ ...options, eveOfPublicHoliday: value })}
        />
        <Toggle
          label={t("reminder.festival-tomorrow")}
          checked={options.eveOfFestival}
          onChange={(value) => updateOptions({ ...options, eveOfFestival: value })}
        />
      </SettingsSection>

      <SettingsSection title={t("settings.backup")} footnote={t("settings.backup-note")}>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => exportData().catch((error) => setMessage(String(error)))}
            className="settings-btn"
          >
            <Icon name="export" className="size-3 shrink-0" />
            {t("settings.export-data")}
          </button>
          <button
            type="button"
            onClick={() => importData().catch((error) => setMessage(String(error)))}
            className="settings-btn"
          >
            <Icon name="import" className="size-3 shrink-0" />
            {t("settings.import-data")}
          </button>
        </div>
        {message && <p className="text-[10px] text-positive">{message}</p>}
      </SettingsSection>
    </div>
  );
}
