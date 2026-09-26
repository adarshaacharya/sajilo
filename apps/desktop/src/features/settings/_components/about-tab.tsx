import { type ReactNode, useEffect, useState } from "react";
import appIcon from "../../../../src-tauri/icons/128x128@2x.png";
import { Icon, type IconName } from "../../../shared/components/icon";
import { TrayPinTip } from "../../../shared/components/tray-pin-tip";
import { useSettings } from "../../../shared/context/settings-context";
import { useUpdater } from "../../../shared/context/updater-context";
import { openExternalLink } from "../../../shared/lib/external-link";
import { isWindows } from "../../../shared/lib/platform";

const REPO_URL = "https://github.com/adarshaacharya/sajilo";
const ISSUES_URL = `${REPO_URL}/issues`;
const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`;
const WEBSITE_URL = "https://sajilo.fyi";
const PRIVACY_URL = `${WEBSITE_URL}/privacy.html`;
const DOCS_URL = `${WEBSITE_URL}/docs.html`;
const CONTACT_EMAIL = "contact@sajilo.fyi";
// The website's Support page, not a payment link: ways to give can be added
// or changed there without a new release reaching everyone first.
const SUPPORT_URL = "https://sajilo.fyi/support.html";

/** One way out of the app, as a settings row: what it is, and an arrow
 * saying it opens outside. */
function LinkRow({
  icon,
  label,
  detail,
  href,
}: {
  icon: IconName;
  label: string;
  detail?: string;
  href: string;
}) {
  return (
    <button
      type="button"
      onClick={() => openExternalLink(href)}
      className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-surface-hover"
    >
      <Icon name={icon} className="size-3.5 shrink-0 text-text-muted" />
      <span className="min-w-0 flex-1 truncate text-[12px]">{label}</span>
      {detail && <span className="shrink-0 text-[11px] text-text-muted">{detail}</span>}
      <Icon name="openExternal" className="size-2.5 shrink-0 text-text-muted" />
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
    <div className="flex items-center justify-between gap-2 border-t border-divider px-3 py-2">
      <p className="min-w-0 truncate text-[11px] text-text-secondary">{message}</p>
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
    <div className="space-y-2.5">
      {/* Who and which version, in one card: no centred stack to scroll. */}
      <section className="surface-card overflow-hidden">
        <div className="flex items-center gap-3 p-3">
          <img src={appIcon} alt="" className="size-11 shrink-0" draggable={false} />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold tracking-tight">Sajilo</p>
            <p className="text-[11px] leading-snug text-text-secondary">{t("about.tagline")}</p>
          </div>
          {version && (
            <span className="shrink-0 rounded-full border border-accent/25 bg-accent/10 px-2 py-0.5 text-[10px] font-medium tabular-nums text-accent">
              {version}
            </span>
          )}
        </div>
        <AboutUpdate />
      </section>

      {/* Every way out, as rows: nothing to read before finding the one. */}
      <section className="surface-card divide-y divide-divider overflow-hidden">
        <LinkRow icon="directory" label={t("about.docs")} href={DOCS_URL} />
        <LinkRow icon="warning" label={t("about.report-issue")} href={ISSUES_URL} />
        <LinkRow
          icon="mail"
          label={t("about.contact")}
          detail={CONTACT_EMAIL}
          href={`mailto:${CONTACT_EMAIL}`}
        />
        <LinkRow icon="link" label={t("about.website")} detail="sajilo.fyi" href={WEBSITE_URL} />
        <LinkRow icon="link" label="GitHub" href={REPO_URL} />
      </section>

      {/* Said once, here, where people look for it: never a prompt or a badge. */}
      <button
        type="button"
        onClick={() => openExternalLink(SUPPORT_URL)}
        className="about-momo flex w-full items-center gap-3 p-3 text-left"
      >
        <span className="text-[24px] leading-none" aria-hidden="true">
          🥟
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] font-semibold text-[color:var(--color-accent-mark)]">
            {t("about.support-button")}
          </span>
          <span className="mt-0.5 block text-[10px] leading-snug text-text-muted">
            {t("about.support-note")}
          </span>
        </span>
        <Icon name="chevronRight" className="size-3 shrink-0 text-text-muted" />
      </button>

      {/* The first-launch card, on demand — for anyone who pressed "Got it"
          before actually moving the icon. */}
      {isWindows &&
        (pinHelp ? (
          <TrayPinTip onDismiss={() => setPinHelp(false)} />
        ) : (
          <button
            type="button"
            onClick={() => setPinHelp(true)}
            className="w-full text-center text-[11px] text-[color:var(--color-accent-mark)] hover:underline"
          >
            {t("tray-pin.help")}
          </button>
        ))}

      <p className="px-2 pt-1 text-center text-[10px] leading-relaxed text-text-muted">
        {t("about.made-in-nepal")} · © 2026{" "}
        <button
          type="button"
          onClick={() => openExternalLink("https://adarsha.dev")}
          className="hover:text-text-secondary hover:underline"
        >
          Adarsha Acharya
        </button>
        <br />
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
