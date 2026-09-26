import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { triggerSetupPreview } from "../../calendar/_components/setup-card";
import { Icon } from "../../../shared/components/icon";
import { Segmented } from "../../../shared/components/segmented";
import { Toggle } from "../../../shared/components/toggle";
import { useSettings } from "../../../shared/context/settings-context";
import { useUpdater } from "../../../shared/context/updater-context";
import {
  api,
  type NotificationOptions,
  type PermissionState,
  type ReminderStyle,
} from "../../../shared/lib/ipc";
import { SettingsSection } from "./settings-section";

function anyReminder(options: NotificationOptions): boolean {
  return (
    options.eveOfFestival ||
    options.eveOfPublicHoliday ||
    options.ipoClosingDay ||
    options.sipPayment
  );
}

export function SystemTab() {
  const { t } = useSettings();
  const navigate = useNavigate();
  const {
    enabled: updaterEnabled,
    state: updateState,
    version: updateVersion,
    error: updateError,
    checkForUpdates,
    installUpdate,
    restartToUpdate,
  } = useUpdater();
  const [options, setOptions] = useState<NotificationOptions>({
    eveOfPublicHoliday: true,
    eveOfFestival: true,
    hour: 19,
    ipoClosingDay: true,
    sipPayment: true,
    style: "card",
  });
  const [permission, setPermission] = useState<PermissionState>("unknown");
  const [message, setMessage] = useState<string | null>(null);
  const [usageInsightsEnabled, setUsageInsightsEnabled] = useState(false);

  useEffect(() => {
    api
      .getNotificationOptions()
      .then(setOptions)
      .catch(() => {});
    api
      .notificationPermission()
      .then(setPermission)
      .catch(() => {});
    api
      .usageInsightsEnabled()
      .then((enabled) => setUsageInsightsEnabled(enabled === true))
      .catch(() => {});
  }, []);

  const updateOptions = async (next: NotificationOptions) => {
    // A card needs no permission; only the system notification does.
    if (anyReminder(next) && next.style === "notification" && permission !== "granted") {
      setPermission(await api.requestNotificationPermission().catch(() => "denied" as const));
    }
    setOptions(next);
    await api.setNotificationOptions(next).catch(() => {});
  };

  const reminderNote =
    permission === "denied" && options.style === "notification"
      ? t("settings.reminder-denied-note")
      : anyReminder(options)
        ? t("settings.reminder-enabled-note")
        : t("settings.reminder-off-note");

  const setUsageInsights = (enabled: boolean) => {
    setUsageInsightsEnabled(enabled);
    api.setUsageInsightsEnabled(enabled).catch(() => setUsageInsightsEnabled(!enabled));
  };

  const exportData = async () => {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const path = await save({
      defaultPath: "Sajilo-backup.db",
      filters: [{ name: "Sajilo SQLite backup", extensions: ["db"] }],
    });
    if (!path) return;
    await api.exportBackup(path);
    setMessage(t("settings.export-data"));
  };

  const importData = async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({
      multiple: false,
      filters: [{ name: "Sajilo SQLite backup", extensions: ["db"] }],
    });
    if (typeof path !== "string") return;
    await api.importBackup(path);
    setMessage(t("settings.backup-imported"));
  };

  // The version number is the part of this line a reader is actually looking
  // for, so it is picked out rather than left to dissolve into grey.
  const version = (value: string) => (
    <span className="font-medium tabular-nums text-accent">{value}</span>
  );

  const updateNote = {
    idle: null,
    checking: t("settings.update-checking"),
    "up-to-date": t("settings.update-up-to-date"),
    available: updateVersion ? (
      <>
        {t("settings.update-found")} {version(updateVersion)}
      </>
    ) : (
      t("settings.update-checking")
    ),
    downloading: updateVersion ? (
      <>
        {t("settings.update-available")} {version(updateVersion)}…
      </>
    ) : (
      t("settings.update-checking")
    ),
    installed: t("settings.update-installed"),
    failed: updateError
      ? `${t("settings.update-failed")} — ${updateError}`
      : t("settings.update-failed"),
  }[updateState];

  return (
    <div className="space-y-2.5">
      {updaterEnabled && (
        <SettingsSection title={t("settings.updates")} footnote={updateNote ?? undefined}>
          {updateState === "installed" ? (
            <button
              type="button"
              onClick={() => restartToUpdate()}
              className="settings-btn settings-btn--accent"
            >
              <Icon name="refresh" className="size-3 shrink-0" />
              {t("settings.update-restart")}
            </button>
          ) : updateState === "available" ? (
            <button
              type="button"
              onClick={() => installUpdate()}
              disabled={!updateVersion}
              className="settings-btn settings-btn--accent"
            >
              <Icon name="refresh" className="size-3 shrink-0" />
              {t("settings.install-update")}
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
        <div className="space-y-2 pb-1">
          <p className="text-[12px]">{t("reminders.style")}</p>
          <Segmented<ReminderStyle>
            label={t("reminders.style")}
            value={options.style}
            onChange={(style) => updateOptions({ ...options, style })}
            options={[
              { id: "card", label: t("reminders.style.card") },
              { id: "notification", label: t("reminders.style.notification") },
            ]}
          />
          <p className="text-[10px] leading-snug text-text-muted">
            {t(
              options.style === "card"
                ? "reminders.style-note.card"
                : "reminders.style-note.notification",
            )}
          </p>
          {options.style === "card" && (
            <button
              type="button"
              onClick={() => api.previewReminderCard().catch(() => {})}
              className="settings-btn"
            >
              {t("reminders.preview")}
            </button>
          )}
        </div>
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
        <Toggle
          label={t("reminder.ipo-closing-day")}
          checked={options.ipoClosingDay}
          onChange={(value) => updateOptions({ ...options, ipoClosingDay: value })}
        />
        <Toggle
          label={t("reminder.sip-payment")}
          checked={options.sipPayment}
          onChange={(value) => updateOptions({ ...options, sipPayment: value })}
        />
      </SettingsSection>

      <SettingsSection title={t("settings.privacy")}>
        <Toggle
          label={t("settings.usage-insights")}
          checked={usageInsightsEnabled}
          onChange={setUsageInsights}
        />
      </SettingsSection>

      {import.meta.env.DEV && (
        <SettingsSection title={t("settings.developer")}>
          <button
            type="button"
            className="settings-btn"
            onClick={() => {
              triggerSetupPreview();
              navigate("/");
            }}
          >
            {t("setup.preview-dev")}
          </button>
        </SettingsSection>
      )}

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
