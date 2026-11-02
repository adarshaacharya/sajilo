import { useSettings } from "../context/settings-context";
import { useUpdater } from "../context/updater-context";
import { digits } from "../lib/numerals";
import { progressPercent } from "../lib/update-progress";

function formatVersionLabel(template: string, version: string): string {
  return template.replace("{version}", version);
}

/** Compact labelled update control for screen headers. */
export function UpdateHeaderButton() {
  const { t, numerals } = useSettings();
  const { enabled, state, version, progress, installUpdate, restartToUpdate } = useUpdater();

  if (!enabled) return null;

  if (state === "downloading") {
    const percent = progressPercent(progress);
    return (
      <span className="update-header-btn update-header-btn--busy shrink-0 tabular-nums">
        {percent === null
          ? t("header.update-downloading")
          : t("header.update-progress").replace("{percent}", digits(percent, numerals))}
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
        className="update-header-btn update-header-btn--glow shrink-0"
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
        className="update-header-btn update-header-btn--glow shrink-0"
      >
        {label}
      </button>
    );
  }

  return null;
}
