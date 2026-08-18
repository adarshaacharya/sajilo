import { useEffect, useState } from "react";
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
  type SupportedRange,
} from "../lib/ipc";
import { digits, type NumeralStyle } from "../lib/numerals";
import { FOREX_OPTIONS, useSettings } from "../lib/settings";

type Tab = "display" | "modules" | "system";

const MENU_BAR_FORMATS = ["nepaliLong", "numeric", "nepaliFlag", "englishShort"] as const;

/** Each label previews the shape it produces, since the option ids say nothing
 * about what lands in the menu bar. */
const MENU_BAR_FORMAT_LABELS: Record<(typeof MENU_BAR_FORMATS)[number], string> = {
  nepaliLong: "Full — साउन ३१, २०८३",
  numeric: "Numeric — २०८३/०४/३१",
  nepaliFlag: "With flag — 🇳🇵 साउन ३१",
  englishShort: "Gregorian — Aug 16",
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
  const [range, setRange] = useState<SupportedRange | null>(null);
  const [format, setFormat] = useState<string>("nepaliLong");

  useEffect(() => {
    api
      .supportedRange()
      .then(setRange)
      .catch(() => {});
  }, []);

  // The tray reads this from the store at launch, so the picker has to read it
  // back too — otherwise it always claims the default no matter what is saved.
  useEffect(() => {
    import("@tauri-apps/plugin-store")
      .then(({ load }) => load("sajilo.json", { autoSave: true }))
      .then((store) => store.get<string>("menuBarFormat"))
      .then((saved) => {
        if (saved) setFormat(saved);
      })
      .catch(() => {
        /* Not running under Tauri; the default stands. */
      });
  }, []);

  return (
    <>
      <Card title={t("settings.language")}>
        <Segmented
          label={t("settings.language")}
          value={language}
          onChange={setLanguage}
          options={[
            { id: "ne" as const, label: t("language.nepali") },
            { id: "en" as const, label: t("language.english") },
          ]}
        />
      </Card>

      <Card title={t("settings.numerals")}>
        <Segmented
          label={t("settings.numerals")}
          value={numerals}
          onChange={setNumerals}
          options={[
            // Each option previews itself in its own digits, so the picker
            // shows what it does.
            { id: "devanagari" as const, label: digits(2083, "devanagari") },
            { id: "latin" as const, label: digits(2083, "latin") },
          ]}
        />
        <p className="mt-1.5 text-[11px] text-text-muted">
          {/* Not a translation setting: month names stay Devanagari either way. */}
          {t("numerals.devanagari")} / {t("numerals.latin")}
        </p>
      </Card>

      <Card title={t("settings.menu-bar")}>
        <Select
          value={format}
          onChange={(next) => {
            setFormat(next);
            import("@tauri-apps/plugin-store")
              .then(({ load }) => load("sajilo.json", { autoSave: true }))
              .then((store) => store.set("menuBarFormat", next))
              // The tray reads the store and is not watching it, so it has to
              // be told the format changed.
              .then(() => api.refreshTray())
              .catch(() => {});
          }}
          options={MENU_BAR_FORMATS.map((id) => ({ id, label: MENU_BAR_FORMAT_LABELS[id] }))}
        />
        <p className="mt-1.5 text-[11px] text-text-muted">{t("settings.format")}</p>
      </Card>

      {range && (
        <Card title={t("settings.calendar-range")}>
          <p className="text-text-secondary">
            {t("settings.calendar-range")}: {range.firstYear}–{range.lastYear}
          </p>
          <p className="mt-0.5 text-text-secondary">
            {t("settings.festivals-range")}: {range.firstEventYear}–{range.lastEventYear}
          </p>
          <p className="mt-1.5 text-[11px] text-text-muted">{t("calendar.provisional")}</p>
        </Card>
      )}
    </>
  );
}

/**
 * Module switches persist to the store and gate navigation + glance cards.
 */
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
                className={`rounded border px-1.5 py-0.5 text-[10px] ${
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
        <div key={row.key} className="border-b border-border/60 py-2 last:border-0">
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

  /**
   * Permission is requested here, at the moment a reminder is switched on —
   * never at launch, and never for a feature nobody asked for.
   */
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
            // The result is what the OS reports back, not what was asked for:
            // on macOS the login item can fail to register silently, and the
            // toggle must not lie.
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
            className="flex-1 rounded-xl border border-border py-1 text-text-secondary hover:bg-surface-hover hover:text-text"
          >
            {t("settings.export-data")}
          </button>
          <button
            type="button"
            onClick={() => importData().catch((error) => setMessage(String(error)))}
            className="flex-1 rounded-xl border border-border py-1 text-text-secondary hover:bg-surface-hover hover:text-text"
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
