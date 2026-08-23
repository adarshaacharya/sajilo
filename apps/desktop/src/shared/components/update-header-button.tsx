import { useSettings } from "../context/settings-context";
import { useUpdater } from "../context/updater-context";

function formatVersionLabel(template: string, version: string): string {
  return template.replace("{version}", version);
}

/** Compact labelled update control for screen headers. */
export function UpdateHeaderButton() {
  const { t } = useSettings();
  const { enabled, state, update, installUpdate, restartToUpdate } = useUpdater();
  const version = update?.version;

  if (!enabled) return null;

  if (state === "downloading") {
    return (
      <span
        className="update-header-btn update-header-btn--busy shrink-0"
        aria-live="polite"
        aria-label={t("header.update-downloading")}
      >
        {t("header.update-downloading")}
      </span>
    );
  }

  if (state === "installed") {
    return (
      <button
        type="button"
        onClick={() => restartToUpdate()}
        aria-label={t("action.restart-update")}
        title={t("action.restart-update")}
        className="update-header-btn shrink-0"
      >
        {t("dashboard.update-restart")}
      </button>
    );
  }

  if (state === "available" && version) {
    const label = formatVersionLabel(t("header.update-version"), version);
    return (
      <button
        type="button"
        onClick={() => installUpdate()}
        aria-label={label}
        title={label}
        className="update-header-btn shrink-0"
      >
        {label}
      </button>
    );
  }

  return null;
}
