import useSWR from "swr";
import { Icon } from "../../../shared/components/icon";
import { useSettings } from "../../../shared/context/settings-context";
import { openExternalLink } from "../../../shared/lib/external-link";
import { api } from "../../../shared/lib/ipc";
import { catchAsFailed, loadedValue } from "../../../shared/lib/load-state";
import type { Announcement } from "../../../types/api/Announcement";
import type { AnnouncementLevel } from "../../../types/api/AnnouncementLevel";
import type { LocalizedText } from "../../../types/api/LocalizedText";

function textForLocale(text: LocalizedText, language: "en" | "ne"): string {
  return text[language] || text.en;
}

function toneFor(level: AnnouncementLevel) {
  if (level === "urgent") {
    return {
      icon: "warning" as const,
      className: "text-negative",
      surfaceClassName: "bg-[color:color-mix(in_srgb,var(--color-negative)_12%,transparent)]",
    };
  }

  if (level === "important") {
    return {
      icon: "warning" as const,
      className: "text-[color:var(--color-accent-mark)]",
      surfaceClassName: "bg-[color:color-mix(in_srgb,var(--color-accent-mark)_12%,transparent)]",
    };
  }

  return {
    icon: "info" as const,
    className: "text-[color:var(--color-accent-mark)]",
    surfaceClassName: "bg-[color:color-mix(in_srgb,var(--color-accent-mark)_12%,transparent)]",
  };
}

function AnnouncementContent({ announcement }: { announcement: Announcement }) {
  const { language } = useSettings();
  const title = textForLocale(announcement.title, language);
  const body = textForLocale(announcement.body, language);
  const actionLabel = announcement.action && textForLocale(announcement.action.label, language);
  const tone = toneFor(announcement.level);

  return (
    <>
      <span
        aria-hidden
        className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-[6px] ${tone.surfaceClassName}`}
      >
        <Icon name={tone.icon} className={`size-3 ${tone.className}`} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-medium leading-4 text-text">{title}</span>
        <span className="mt-0.5 block text-[10px] leading-[14px] text-text-muted">{body}</span>
        {actionLabel && (
          <span
            className={`mt-1.5 inline-flex items-center gap-1 text-[10px] font-medium ${tone.className}`}
          >
            {actionLabel}
            <Icon name="openExternal" className="size-3" />
          </span>
        )}
      </span>
    </>
  );
}

/** One notice: the whole card opens its link when it has one, and anything
 * short of urgent can be closed for good. */
function AnnouncementCard({
  announcement,
  onDismiss,
}: {
  announcement: Announcement;
  onDismiss: (id: string) => void;
}) {
  const { t } = useSettings();
  const action = announcement.action;
  const body =
    "flex min-w-0 flex-1 items-start gap-2.5 px-2.5 py-2.5 text-left transition-colors active:scale-[0.99]";

  return (
    <div className="surface-card flex w-full items-start">
      {action ? (
        <button
          type="button"
          className={body}
          aria-label={`${action.label.en}: ${announcement.title.en}`}
          onClick={() => openExternalLink(action.url)}
        >
          <AnnouncementContent announcement={announcement} />
        </button>
      ) : (
        <article className={body} aria-label={announcement.title.en}>
          <AnnouncementContent announcement={announcement} />
        </article>
      )}
      {/* Urgent notices stay until they expire; the engine ignores closing
          them too, so no button pretends otherwise. */}
      {announcement.level !== "urgent" && (
        <button
          type="button"
          className="icon-btn m-1.5 size-6 shrink-0 text-text-muted"
          aria-label={t("announcement.dismiss")}
          title={t("announcement.dismiss")}
          onClick={() => onDismiss(announcement.id)}
        >
          <Icon name="close" className="size-3" />
        </button>
      )}
    </div>
  );
}

/** Server-scheduled notices, already filtered for this device by the engine;
 * no empty, loading, or failure chrome on Home. */
export function HomeAnnouncement() {
  const { data: state, mutate } = useSWR(
    "announcement",
    () => catchAsFailed(api.getAnnouncement(false)),
    { revalidateOnFocus: false },
  );
  const announcements = loadedValue(state)?.announcements ?? [];
  if (announcements.length === 0) return null;

  const dismiss = (id: string) => {
    void api
      .dismissAnnouncement(id)
      .then(() => mutate())
      .catch(() => {});
  };

  return (
    <div className="flex flex-col gap-2">
      {announcements.map((announcement) => (
        <AnnouncementCard key={announcement.id} announcement={announcement} onDismiss={dismiss} />
      ))}
    </div>
  );
}
