import { useEffect, useState } from "react";
import appIconUrl from "../../../src-tauri/icons/128x128@2x.png";
import { useSettings } from "../context/settings-context";
import { useUpdater } from "../context/updater-context";
import { openExternalLink } from "../lib/external-link";
import { Icon } from "./icon";

const SNOOZE_KEY = "sajilo.updater.windowSnooze.v1";
const SNOOZE_MS = 24 * 60 * 60 * 1000;

interface Snooze {
  version: string;
  until: number;
}

function isSnoozed(version: string): boolean {
  try {
    const value = JSON.parse(localStorage.getItem(SNOOZE_KEY) ?? "null") as Snooze | null;
    return value?.version === version && value.until > Date.now();
  } catch {
    return false;
  }
}

/** A dedicated desktop surface that stays hidden until an update is available. */
export function UpdateWindow() {
  const { t } = useSettings();
  const {
    enabled,
    automaticUpdates,
    state,
    update,
    installUpdate,
    restartToUpdate,
    setAutomaticUpdates,
  } = useUpdater();
  const [hiddenVersion, setHiddenVersion] = useState<string | null>(null);
  const [installFailed, setInstallFailed] = useState(false);
  const version = update?.version;
  const visible =
    enabled &&
    version !== undefined &&
    hiddenVersion !== version &&
    !isSnoozed(version) &&
    ["available", "downloading", "installed", "failed"].includes(state) &&
    !(automaticUpdates && state === "downloading");

  useEffect(() => {
    if (!visible) return;
    void import("@tauri-apps/api/window")
      .then(async ({ getCurrentWindow }) => {
        const current = getCurrentWindow();
        await current.show();
        await current.setFocus();
      })
      .catch(() => {});
  }, [visible]);

  if (!update || !version) return null;

  const later = () => {
    localStorage.setItem(
      SNOOZE_KEY,
      JSON.stringify({ version, until: Date.now() + SNOOZE_MS } satisfies Snooze),
    );
    setHiddenVersion(version);
    void import("@tauri-apps/api/window")
      .then(({ getCurrentWindow }) => getCurrentWindow().hide())
      .catch(() => {});
  };

  const install = async () => {
    setInstallFailed(false);
    if (state === "installed") {
      await restartToUpdate();
      return;
    }
    if (await installUpdate()) {
      await restartToUpdate();
    } else {
      setInstallFailed(true);
    }
  };

  return (
    <section
      aria-labelledby="update-prompt-title"
      aria-describedby="update-prompt-description"
      className="update-window"
      data-tauri-drag-region
    >
      <button
        type="button"
        aria-label={t("updater.close")}
        disabled={state === "downloading"}
        onClick={later}
        className="update-window__close"
      >
        ×
      </button>

      <div className="flex items-start gap-3" data-tauri-drag-region>
        <img src={appIconUrl} alt="" className="size-10 shrink-0" draggable={false} />
        <div className="min-w-0 flex-1">
          <h2
            id="update-prompt-title"
            className="text-[15px] font-semibold leading-tight text-text"
            data-tauri-drag-region
          >
            {state === "installed" ? t("updater.ready-title") : t("updater.prompt-title")}
          </h2>
          <p
            className="mt-1 text-[11px] font-medium tabular-nums text-text-secondary"
            data-tauri-drag-region
          >
            Sajilo {version}
          </p>
        </div>
      </div>

      <p
        id="update-prompt-description"
        className="mt-3 text-[12px] leading-relaxed text-text-secondary"
        data-tauri-drag-region
      >
        {state === "installed" ? t("updater.ready-body") : t("updater.prompt-body")}
      </p>

      <button
        type="button"
        onClick={() =>
          openExternalLink(`https://github.com/adarshaacharya/sajilo/releases/tag/v${version}`)
        }
        className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:underline"
      >
        {t("updater.whats-new")}
        <Icon name="openExternal" className="size-[9px]" />
      </button>

      {(installFailed || state === "failed") && (
        <p role="alert" className="mt-2 text-[10px] leading-snug text-negative">
          {t("updater.install-failed")}
        </p>
      )}

      <label className="update-window__automatic">
        <input
          type="checkbox"
          checked={automaticUpdates}
          onChange={(event) => setAutomaticUpdates(event.currentTarget.checked)}
        />
        <span>{t("updater.automatic-updates")}</span>
      </label>

      <div className="update-window__actions">
        <button
          type="button"
          disabled={state === "downloading"}
          onClick={later}
          className="settings-btn min-w-[64px] justify-center disabled:opacity-50"
        >
          {t("updater.later")}
        </button>
        <button
          type="button"
          disabled={state === "downloading"}
          onClick={() => install()}
          className="settings-btn settings-btn--accent min-w-[126px] justify-center disabled:opacity-60"
        >
          {state === "installed"
            ? t("settings.update-restart")
            : state === "downloading"
              ? t("updater.installing")
              : state === "failed" || installFailed
                ? t("updater.try-again")
                : t("updater.install-restart")}
        </button>
      </div>
    </section>
  );
}
