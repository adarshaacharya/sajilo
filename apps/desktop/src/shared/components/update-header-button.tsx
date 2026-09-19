import { useEffect, useState } from "react";
import { useSettings } from "../context/settings-context";
import { useUpdater } from "../context/updater-context";

function formatVersionLabel(template: string, version: string): string {
  return template.replace("{version}", version);
}

/**
 * Counts the times the popover is brought up. The popover is hidden rather
 * than closed, so nothing remounts on opening it; keying the pill on this is
 * what lets its glow play again each time.
 */
function useOpenCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const opened = () => setCount((current) => current + 1);
    window.addEventListener("focus", opened);
    return () => window.removeEventListener("focus", opened);
  }, []);
  return count;
}

/** Compact labelled update control for screen headers. */
export function UpdateHeaderButton() {
  const { t } = useSettings();
  const { enabled, state, version, installUpdate, restartToUpdate } = useUpdater();
  const opened = useOpenCount();

  if (!enabled) return null;

  if (state === "downloading") {
    return (
      <span className="update-header-btn update-header-btn--busy shrink-0" aria-live="polite">
        {t("header.update-downloading")}
      </span>
    );
  }

  if (state === "installed") {
    return (
      <button
        key={opened}
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
        key={opened}
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
