import { useEffect, useState } from "react";
import appIcon from "../../../../src-tauri/icons/128x128@2x.png";
import { useSettings } from "../../../shared/context/settings-context";
import { openExternalLink } from "../../../shared/lib/external-link";

const REPO_URL = "https://github.com/adarshaacharya/sajilo";
const ISSUES_URL = `${REPO_URL}/issues`;
const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`;
const WEBSITE_URL = "https://sajilo.fyi";
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

export function AboutTab() {
  const { t } = useSettings();
  const [version, setVersion] = useState<string | null>(null);

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
        <p className="mt-0.5 text-[10px] text-text-muted">
          {t("about.version")} {version}
        </p>
      )}

      <div className="mt-4 flex items-center gap-1.5">
        <QuietLink label="GitHub" href={REPO_URL} />
        <span className="text-[10px] text-text-muted">·</span>
        <QuietLink label={t("about.report-issue")} href={ISSUES_URL} />
        <span className="text-[10px] text-text-muted">·</span>
        <QuietLink label={CONTACT_EMAIL} href={`mailto:${CONTACT_EMAIL}`} />
      </div>

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
      </p>
    </div>
  );
}
