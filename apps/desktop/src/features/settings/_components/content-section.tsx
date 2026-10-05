import { useEffect, useState } from "react";
import { Icon } from "../../../shared/components/icon";
import { useSettings } from "../../../shared/context/settings-context";
import { api } from "../../../shared/lib/ipc";
import type { RemoteConfigStatus } from "../../../types/api/RemoteConfigStatus";
import { SettingsSection } from "./settings-section";

/** "Checked 2 hours ago", in the app's language. */
function ago(iso: string, language: string) {
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
  const format = new Intl.RelativeTimeFormat(language === "ne" ? "ne-NP" : "en", {
    numeric: "auto",
  });
  if (Math.abs(minutes) < 60) return format.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 48) return format.format(hours, "hour");
  return format.format(Math.round(hours / 24), "day");
}

/** The signed remote config: whether it is current, and a way to check now. */
export function ContentSection() {
  const { t, language } = useSettings();
  const [status, setStatus] = useState<RemoteConfigStatus | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    api
      .remoteConfigStatus()
      .then(setStatus)
      .catch(() => {});
  }, []);

  const checkNow = () => {
    setChecking(true);
    api
      .checkRemoteConfig()
      .then(setStatus)
      .catch(() => {})
      .finally(() => setChecking(false));
  };

  const remote = status?.packs.filter((pack) => pack.source === "remote").length ?? 0;
  const lines = !status
    ? []
    : [
        status.error
          ? t("settings.content-failed")
          : status.checkedAt
            ? t("settings.content-checked").replace("{time}", ago(status.checkedAt, language))
            : t("settings.content-never"),
        remote > 0
          ? t("settings.content-updated")
              .replace("{count}", String(remote))
              .replace("{total}", String(status.packs.length))
          : null,
      ].filter((line): line is string => line !== null);

  return (
    <SettingsSection title={t("settings.content")} footnote={t("settings.content-note")}>
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 text-[10px] text-text-muted">
          {lines.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </span>
        <button
          type="button"
          onClick={checkNow}
          disabled={checking}
          className="settings-btn shrink-0"
        >
          <Icon name="refresh" className="size-3 shrink-0" />
          {checking ? t("settings.content-checking") : t("settings.content-check")}
        </button>
      </div>
    </SettingsSection>
  );
}
