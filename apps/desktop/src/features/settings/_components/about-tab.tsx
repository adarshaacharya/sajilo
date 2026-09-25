import { type ReactNode, useEffect, useState } from "react";
import appIcon from "../../../../src-tauri/icons/128x128@2x.png";
import { TrayPinTip } from "../../../shared/components/tray-pin-tip";
import { useSettings } from "../../../shared/context/settings-context";
import { useUpdater } from "../../../shared/context/updater-context";
import { openExternalLink, SUPPORT_URL } from "../../../shared/lib/external-link";
import { isWindows } from "../../../shared/lib/platform";

const REPO_URL = "https://github.com/adarshaacharya/sajilo";
const ISSUES_URL = `${REPO_URL}/issues`;
const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`;
const WEBSITE_URL = "https://sajilo.fyi";
const PRIVACY_URL = `${WEBSITE_URL}/privacy.html`;
const DOCS_URL = `${WEBSITE_URL}/docs.html`;
const CONTACT_EMAIL = "contact@sajilo.fyi";

function QuietLink({ label, href }: { label: string; href: string }) {
  return (
    <button
      type="button"
      onClick={() => openExternalLink(href)}
      className="text-[11px] text-text-secondary transition-colors hover:text-text-primary hover:underline"
    >
      {label}
    </button>
  );
}

/**
 * The update, offered where people look for the version number. The screen
 * header carries a compact control for the same thing; this one says what the
 * update is before asking for the click. It follows the updater through every
 * state a user can act on or wait for — found, installing, ready to restart —
 * and stays out of the way otherwise.
 */
function AboutUpdate() {
  const { t } = useSettings();
  const { enabled, state, version, installUpdate, restartToUpdate } = useUpdater();

  if (!enabled) return null;

  let message: ReactNode;
  let control: ReactNode;
  if (state === "installed") {
    message = t("settings.update-installed");
    control = (
      <button
        type="button"
        onClick={() => restartToUpdate()}
        className="update-header-btn"
        style={{ maxWidth: "none" }}
      >
        {t("settings.update-restart")}
      </button>
    );
  } else if ((state === "available" || state === "downloading") && version) {
    message = (
      <>
        {t("settings.update-found")}{" "}
        <span className="font-medium tabular-nums text-accent">{version}</span>
      </>
    );
    control =
      state === "downloading" ? (
        <span
          className="update-header-btn update-header-btn--busy"
          style={{ maxWidth: "none" }}
          aria-live="polite"
        >
          {t("updater.installing")}
        </span>
      ) : (
        <button
          type="button"
          onClick={() => installUpdate()}
          className="update-header-btn"
          style={{ maxWidth: "none" }}
        >
          {t("settings.install-update")}
        </button>
      );
  } else {
    return null;
  }

  return (
    <div className="mt-3 flex flex-col items-center gap-1.5">
      <p className="text-[10px] text-text-muted">{message}</p>
      {control}
    </div>
  );
}

export function AboutTab() {
  const { t } = useSettings();
  const [version, setVersion] = useState<string | null>(null);
  const [pinHelp, setPinHelp] = useState(false);

  useEffect(() => {
    import("@tauri-apps/api/app")
      .then(({ getVersion }) => getVersion())
      .then(setVersion)
      .catch(() => {});
  }, []);

  return (
    <div className="flex flex-col items-center gap-1 px-2 pt-6 pb-2 text-center">
      <img src={appIcon} alt="" className="size-16" draggable={false} />

      <p className="mt-2 text-[17px] font-semibold tracking-tight">Sajilo</p>
      <p className="text-[11px] text-text-secondary">{t("about.tagline")}</p>
      <QuietLink label="sajilo.fyi" href={WEBSITE_URL} />
      {version && (
        <p className="mt-1 inline-flex items-center gap-1 rounded-full border border-accent/25 bg-accent/10 px-2 py-0.5 text-[10px] text-text-muted">
          {t("about.version")}
          <span className="font-medium tabular-nums text-accent">{version}</span>
        </p>
      )}
      <AboutUpdate />

      <p className="mt-5 max-w-[240px] text-[10px] leading-relaxed text-text-muted">
        {t("about.feedback")}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1.5">
        <QuietLink label={t("about.docs")} href={DOCS_URL} />
        <span className="text-[10px] text-text-muted">·</span>
        <QuietLink label="GitHub" href={REPO_URL} />
        <span className="text-[10px] text-text-muted">·</span>
        <QuietLink label={t("about.report-issue")} href={ISSUES_URL} />
        <span className="text-[10px] text-text-muted">·</span>
        <QuietLink label={CONTACT_EMAIL} href={`mailto:${CONTACT_EMAIL}`} />
      </div>

      {/* Said once, here, where people look for it: never a prompt or a badge. */}
      <p className="mt-5 max-w-[240px] text-[10px] leading-relaxed text-text-muted">
        {t("about.support-note")}
      </p>
      <button
        type="button"
        onClick={() => openExternalLink(SUPPORT_URL)}
        className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-[11px] font-medium text-[color:var(--color-accent-mark)] transition-colors hover:bg-accent/20"
      >
        <span aria-hidden="true">🥟</span>
        {t("about.support-button")}
      </button>

      {/* The first-launch card, on demand — for anyone who pressed "Got it"
          before actually moving the icon. */}
      {isWindows &&
        (pinHelp ? (
          <div className="mt-4 w-full text-left">
            <TrayPinTip onDismiss={() => setPinHelp(false)} />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setPinHelp(true)}
            className="mt-3 text-[11px] text-[color:var(--color-accent-mark)] hover:underline"
          >
            {t("tray-pin.help")}
          </button>
        ))}

      <p className="mt-6 text-[10px] leading-relaxed text-text-muted">
        {t("about.made-in-nepal")}
        <br />© 2026{" "}
        <button
          type="button"
          onClick={() => openExternalLink("https://adarsha.dev")}
          className="hover:text-text-secondary hover:underline"
        >
          Adarsha Acharya
        </button>
        {" · "}
        <button
          type="button"
          onClick={() => openExternalLink(LICENSE_URL)}
          className="hover:text-text-secondary hover:underline"
        >
          {t("about.rights")}
        </button>
        {" · "}
        <button
          type="button"
          onClick={() => openExternalLink(PRIVACY_URL)}
          className="hover:text-text-secondary hover:underline"
        >
          {t("about.privacy")}
        </button>
      </p>
    </div>
  );
}
