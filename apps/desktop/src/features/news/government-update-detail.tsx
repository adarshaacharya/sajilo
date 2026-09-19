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

/** Government portal filenames are opaque upload IDs, not something worth
 * showing a reader — the extension is the only part of the name that means
 * anything to them. */
function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot + 1).toUpperCase();
}

function AttachmentRow({
  attachment,
  index,
  t,
}: {
  attachment: NewsAttachment;
  index: number;
  t: ReturnType<typeof useSettings>["t"];
}) {
  const ext = extensionOf(attachment.filename);
  return (
    <button
      type="button"
      onClick={() => openExternalLink(attachment.url)}
      title={attachment.filename}
      className="row-line flex w-full items-center gap-2.5 px-2 py-2 text-left transition-colors hover:bg-surface-hover"
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-[7px] bg-surface">
        <Icon name="documentBlank" className="size-3.5 text-text-secondary" />
      </span>
      <span className="min-w-0 flex-1 truncate text-[11px] font-medium">
        {t("news.attachment-n").replace("{n}", String(index + 1))}
      </span>
      {ext && (
        <span className="shrink-0 rounded-md bg-surface px-1.5 text-[9px] font-semibold tracking-wide text-text-muted">
          {ext}
        </span>
      )}
      <span className="shrink-0 text-[10px] text-text-muted">{formatSize(attachment.size)}</span>
      <Icon name="openExternal" className="size-2.5 shrink-0 text-text-muted" />
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
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface py-0.5 pr-2.5 pl-1.5 text-[10px] font-semibold text-text-secondary">
            <Icon name="shield" className="size-3 text-text-muted" />
            {t("news.government-source")}
          </span>

          <h2 className="mt-2.5 text-[16px] font-semibold leading-snug text-text">
            {update.title}
          </h2>

          <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-text-secondary">
            {update.department && <span className="font-medium">{update.department}</span>}
            {update.department && update.published && <span className="text-text-muted">·</span>}
            {update.published && (
              <time dateTime={update.published} className="text-text-muted tabular-nums">
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
            <div className="mt-2 flex flex-wrap gap-1">
              {update.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-surface px-2 py-0.5 text-[10px] text-text-secondary"
                >
                  {formatTag(tag)}
                </span>
              ))}
            </div>
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
                {update.attachments.map((attachment, index) => (
                  <AttachmentRow key={attachment.id} attachment={attachment} index={index} t={t} />
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
