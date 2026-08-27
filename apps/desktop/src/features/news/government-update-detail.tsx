import { useSearchParams } from "react-router";
import useSWR from "swr";
import { Icon } from "../../shared/components/icon";
import { StateBanner } from "../../shared/components/state-banner";
import { useSettings } from "../../shared/context/settings-context";
import { openExternalLink } from "../../shared/lib/external-link";
import { api } from "../../shared/lib/ipc";
import { catchAsFailed, loadBanner, loadedValue } from "../../shared/lib/load-state";
import type { NewsAttachment } from "../../types/api/NewsAttachment";

function formatTag(tag: string): string {
  return tag
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentRow({ attachment }: { attachment: NewsAttachment }) {
  return (
    <button
      type="button"
      onClick={() => openExternalLink(attachment.url)}
      className="row-line flex w-full items-center gap-2 px-2 py-2 text-left transition-colors hover:bg-surface-hover"
    >
      <Icon name="link" className="size-3.5 shrink-0 text-text-secondary" />
      <span className="min-w-0 flex-1 truncate text-[11px] font-medium">{attachment.filename}</span>
      <span className="shrink-0 text-[10px] text-text-muted">{formatSize(attachment.size)}</span>
    </button>
  );
}

export function GovernmentUpdateDetail() {
  const { language, t } = useSettings();
  const [params] = useSearchParams();
  const id = params.get("id");
  const { data: state } = useSWR("news", () => catchAsFailed(api.getNews(false)));
  const digest = loadedValue(state);
  const update = digest?.items.find((item) => item.source === "nepalGovernment" && item.id === id);
  const banner = loadBanner(state);

  return (
    <StateBanner state={banner}>
      {!update?.content ? (
        <div className="surface-card p-2.5">
          <p className="text-[12px] font-medium">{t("news.official-unavailable")}</p>
          <button
            type="button"
            onClick={() => openExternalLink("https://nepal.gov.np/updates")}
            className="btn-ghost mt-2 -ml-2 text-[11px] text-[color:var(--color-accent-mark)]"
          >
            {t("news.open-government-portal")} ↗
          </button>
        </div>
      ) : (
        <article className="px-0.5 pb-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[color:var(--color-accent-mark)]">
            {t("news.government-source")}
          </p>
          <h2 className="mt-1 text-[15px] font-semibold leading-snug text-text">{update.title}</h2>

          <div className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[10px] text-text-muted">
            {update.department && <span>{update.department}</span>}
            {update.department && update.published && <span>·</span>}
            {update.published && (
              <time dateTime={update.published}>
                {new Date(update.published).toLocaleString(language === "ne" ? "ne-NP" : "en-GB", {
                  day: "numeric",
                  month: "short",
                  hour: "numeric",
                  minute: "2-digit",
                  timeZone: "Asia/Kathmandu",
                })}
              </time>
            )}
          </div>

          {update.tags.length > 0 && (
            <p className="mt-1 text-[10px] text-text-secondary">
              {update.tags.map(formatTag).join(" · ")}
            </p>
          )}

          <div className="section-divider mt-3 space-y-2.5 pt-3 text-[12px] leading-relaxed text-text-secondary select-text">
            {update.content
              .split(/\n\s*\n/)
              .filter(Boolean)
              .map((paragraph) => (
                <p key={paragraph} className="whitespace-pre-line">
                  {paragraph}
                </p>
              ))}
          </div>

          {update.attachments.length > 0 && (
            <section className="mt-3">
              <h3 className="mb-1.5 text-[11px] font-semibold text-text-secondary">
                {t("news.attachments")}
              </h3>
              <div className="surface-card list-rows overflow-hidden">
                {update.attachments.map((attachment) => (
                  <AttachmentRow key={attachment.id} attachment={attachment} />
                ))}
              </div>
            </section>
          )}

          <button
            type="button"
            onClick={() => openExternalLink(update.link)}
            className="btn-ghost mt-3 -ml-2 text-[11px] text-[color:var(--color-accent-mark)]"
          >
            {t("news.open-government-portal")} ↗
          </button>
        </article>
      )}
    </StateBanner>
  );
}
