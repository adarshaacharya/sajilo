import { useSettings } from "../context/settings-context";
import { useUpdater } from "../context/updater-context";
import { digits } from "../lib/numerals";
import { progressPercent } from "../lib/update-progress";
import { Icon } from "./icon";

function formatVersionLabel(template: string, version: string): string {
  return template.replace("{version}", version);
}

/**
 * The update control for screen headers: a labelled pill, or with `compact`
 * a glowing icon that says what it does when pointed at, for a header whose
 * title needs the width (Today's date).
 */
export function UpdateHeaderButton({ compact = false }: { compact?: boolean }) {
  const { t, numerals } = useSettings();
  const { enabled, state, version, progress, installUpdate, restartToUpdate } = useUpdater();

  if (!enabled) return null;

  if (state === "downloading") {
    const percent = progressPercent(progress);
    return (
      <span className="update-header-btn update-header-btn--busy shrink-0 tabular-nums">
        {percent === null
          ? compact
            ? "…"
            : t("header.update-downloading")
          : compact
            ? `${digits(percent, numerals)}%`
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
        className={`update-header-btn update-header-btn--glow shrink-0${compact ? " update-header-btn--icon" : ""}`}
      >
        {compact ? <Icon name="refresh" className="size-3.5" /> : t("dashboard.update-restart")}
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
        className={`update-header-btn update-header-btn--glow shrink-0${compact ? " update-header-btn--icon" : ""}`}
      >
        {compact ? <Icon name="refresh" className="size-3.5" /> : label}
      </button>
    );
  }

  return null;
}
