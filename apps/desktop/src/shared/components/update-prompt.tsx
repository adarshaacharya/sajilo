import { useEffect, useState } from "react";
import appIconUrl from "../../../src-tauri/icons/128x128@2x.png";
import { useSettings } from "../context/settings-context";
import { DOWNLOAD_URL, STALLED, useUpdater } from "../context/updater-context";
import { openExternalLink } from "../lib/external-link";
import { api } from "../lib/ipc";
import { progressLabel, progressPercent } from "../lib/update-progress";
import { Icon } from "./icon";

const SNOOZE_KEY = "sajilo.updater.windowSnooze.v1";
const SNOOZE_MS = 24 * 60 * 60 * 1000;
/** "Couldn't update itself" is said once a version, not daily. */
const STUCK_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;

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
  const { t, numerals } = useSettings();
  const {
    enabled,
    installKind,
    state,
    version,
    progress,
    error,
    stuck,
    installUpdate,
    restartToUpdate,
  } = useUpdater();
  // Quiet installs that have failed for days: the one time the user hears of
  // it, with the download that gets them going again.
  const notice = installKind === "auto" && stuck;
  const manual = installKind === "manual" || notice;
  const percent = progressPercent(progress);
  const [hiddenVersion, setHiddenVersion] = useState<string | null>(null);
  const [installFailed, setInstallFailed] = useState(false);
  const visible =
    enabled &&
    version !== null &&
    hiddenVersion !== version &&
    !isSnoozed(version) &&
    // Where installing is quiet it happens on its own, and the app restarts
    // into it once nobody's looking, so there is nothing to ask. A failed
    // attempt is retried by the next half-hourly check; Settings shows it.
    // Otherwise the window is only for installs that need the user.
    (notice ||
      (installKind !== "auto" &&
        ["available", "downloading", "installed", "failed"].includes(state)));

  useEffect(() => {
    void import("@tauri-apps/api/window")
      .then(async ({ getCurrentWindow }) => {
        const current = getCurrentWindow();
        if (!visible) {
          // An install that went through after all takes the notice away.
          await current.hide();
          return;
        }
        await current.show();
        await current.setFocus();
      })
      .catch(() => {});
  }, [visible]);

  // The tray menu is where a menu-bar app is looked at most, so an installed
  // update waiting on a restart is offered there too — past "Later" and after
  // this window is gone. Only this window sets it: it owns the updater.
  const trayLabel =
    enabled && state === "installed" && version
      ? t("tray.update-restart").replace("{version}", version)
      : null;
  useEffect(() => {
    api.setTrayUpdate(trayLabel).catch(() => {});
  }, [trayLabel]);

  if (!version) return null;

  const later = () => {
    const until = Date.now() + (notice ? STUCK_SNOOZE_MS : SNOOZE_MS);
    localStorage.setItem(SNOOZE_KEY, JSON.stringify({ version, until } satisfies Snooze));
    setHiddenVersion(version);
    void import("@tauri-apps/api/window")
      .then(({ getCurrentWindow }) => getCurrentWindow().hide())
      .catch(() => {});
  };

  const install = async () => {
    setInstallFailed(false);
    // Nothing to install here: the download page, and out of the way.
    if (manual) {
      openExternalLink(DOWNLOAD_URL);
      later();
      return;
    }
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
        disabled={state === "downloading" && !notice}
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
            {notice
              ? t("updater.stuck-title")
              : state === "installed"
                ? t("updater.ready-title")
                : t("updater.prompt-title")}
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
        {notice
          ? t("updater.stuck-body")
          : state === "installed"
            ? t("updater.ready-body")
            : installKind === "manual"
              ? t("updater.manual-body")
              : t("updater.prompt-body")}
      </p>
      {installKind === "prompt" && state !== "installed" && (
        <p className="mt-1 text-[11px] leading-snug text-text-muted" data-tauri-drag-region>
          {t("updater.needs-password")}
        </p>
      )}

      <button
        type="button"
        onClick={() => openExternalLink(`https://sajilo.fyi/releases/v${version}.html`)}
        className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:underline"
      >
        {t("updater.whats-new")}
        <Icon name="openExternal" className="size-[9px]" />
      </button>

      {!notice && state === "downloading" && progress && (
        <div className="update-window__progress" aria-live="polite">
          <div
            className="update-window__bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent ?? undefined}
          >
            <span
              className={percent === null ? "update-window__bar-fill--unknown" : undefined}
              style={percent === null ? undefined : { width: `${percent}%` }}
            />
          </div>
          <span className="tabular-nums">{progressLabel(progress, t, numerals)}</span>
        </div>
      )}

      {!notice && (installFailed || state === "failed") && (
        <p role="alert" className="mt-2 text-[10px] leading-snug text-negative">
          {state === "failed" && error === STALLED
            ? t("updater.stalled")
            : t("updater.install-failed")}{" "}
          <button
            type="button"
            onClick={() => openExternalLink(DOWNLOAD_URL)}
            className="font-medium text-accent underline-offset-2 hover:underline"
          >
            {t("updater.download-instead")}
          </button>
        </p>
      )}

      <div className="update-window__actions">
        <button
          type="button"
          disabled={state === "downloading" && !notice}
          onClick={later}
          className="settings-btn min-w-[64px] justify-center disabled:opacity-50"
        >
          {t("updater.later")}
        </button>
        <button
          type="button"
          disabled={state === "downloading" && !notice}
          onClick={() => install()}
          className="settings-btn settings-btn--accent min-w-[126px] justify-center disabled:opacity-60"
        >
          {manual
            ? t("updater.download")
            : state === "installed"
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
