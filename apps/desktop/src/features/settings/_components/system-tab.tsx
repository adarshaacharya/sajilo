import { useEffect, useState } from "react";
import { Icon } from "../../../shared/components/icon";
import { Toggle } from "../../../shared/components/toggle";
import { useSettings } from "../../../shared/context/settings-context";
import { api, type NotificationOptions, type PermissionState } from "../../../shared/lib/ipc";
import { SettingsSection } from "./settings-section";

export function SystemTab() {
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
  const [updateError, setUpdateError] = useState<string | null>(null);

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

  const checkForUpdates = async () => {
    setUpdateState("checking");
    setUpdateError(null);
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
    } catch (error) {
      setUpdateError(String(error));
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
    failed: updateError
      ? `${t("settings.update-failed")} — ${updateError}`
      : t("settings.update-failed"),
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
