import { useState } from "react";
import useSWR from "swr";
import { Icon } from "../../../shared/components/icon";
import { useSettings } from "../../../shared/context/settings-context";
import { openExternalLink } from "../../../shared/lib/external-link";
import { api } from "../../../shared/lib/ipc";
import { catchAsFailed, loadedValue } from "../../../shared/lib/load-state";
import { digits } from "../../../shared/lib/numerals";
import type { AnnouncementLevel } from "../../../types/api/AnnouncementLevel";
import type { LocalizedText } from "../../../types/api/LocalizedText";

function textForLocale(text: LocalizedText, language: "en" | "ne"): string {
  return text[language] || text.en;
}

/**
 * A notice reads as a message from Sajilo, not as another card: a tinted strip
 * with a coloured edge. Red for urgent, gold for important, and a quiet
 * neutral edge for everything else, so the three are told apart at a glance.
 */
const TONES: Record<AnnouncementLevel, { edge: string; surface: string; title: string }> = {
  urgent: {
    edge: "bg-negative",
    surface: "bg-[color:color-mix(in_srgb,var(--color-negative)_9%,var(--color-surface))]",
    title: "text-negative",
  },
  important: {
    edge: "bg-[color:var(--color-accent-mark)]",
    surface: "bg-[color:color-mix(in_srgb,var(--color-accent-mark)_10%,var(--color-surface))]",
    title: "text-text",
  },
  info: {
    edge: "bg-[color:var(--color-text-muted)]",
    surface: "bg-surface",
    title: "text-text",
  },
};

/** Server-scheduled notices, already filtered for this device by the engine.
 * One shows at a time, most pressing first, so Today grows by one strip however
 * many are live; no empty, loading, or failure chrome. */
export function HomeAnnouncement() {
  const { t, language, numerals } = useSettings();
  const { data: state, mutate } = useSWR(
    "announcement",
    () => catchAsFailed(api.getAnnouncement(false)),
    { revalidateOnFocus: false },
  );
  const [index, setIndex] = useState(0);
  const announcements = loadedValue(state)?.announcements ?? [];
  if (announcements.length === 0) return null;

  const shown = Math.min(index, announcements.length - 1);
  const notice = announcements[shown];
  if (!notice) return null;
  const tone = TONES[notice.level];
  const action = notice.action;
  const several = announcements.length > 1;

  const dismiss = () => {
    void api
      .dismissAnnouncement(notice.id)
      .then(() => mutate())
      .catch(() => {});
  };

  return (
    <section
      className={`relative flex overflow-hidden rounded-[10px] border border-divider ${tone.surface}`}
      aria-label={t("announcement.label")}
    >
      <span aria-hidden className={`w-[3px] shrink-0 ${tone.edge}`} />
      <div className="min-w-0 flex-1 py-2 pr-1 pl-2.5">
        <p className={`text-[12px] font-semibold leading-4 ${tone.title}`}>
          {textForLocale(notice.title, language)}
        </p>
        <p className="mt-0.5 line-clamp-3 text-[11px] leading-[15px] text-text-secondary">
          {textForLocale(notice.body, language)}
        </p>
        {action && (
          <button
            type="button"
            onClick={() => openExternalLink(action.url)}
            className="mt-1 text-[11px] font-medium text-[color:var(--color-accent-mark)] hover:underline"
          >
            {textForLocale(action.label, language)} ›
          </button>
        )}
      </div>
      <div className="flex shrink-0 items-start gap-0.5 p-1">
        {several && (
          <button
            type="button"
            onClick={() => setIndex((shown + 1) % announcements.length)}
            className="flex h-5 items-center gap-0.5 rounded-md px-1 text-[10px] tabular-nums text-text-muted hover:bg-surface-hover"
            aria-label={t("announcement.next")}
            title={t("announcement.next")}
          >
            {digits(shown + 1, numerals)}/{digits(announcements.length, numerals)}
            <Icon name="chevronDown" className="size-2.5 -rotate-90" />
          </button>
        )}
        {/* Urgent notices stay until they expire; the engine ignores closing
            them too, so no button pretends otherwise. */}
        {notice.level !== "urgent" && (
          <button
            type="button"
            onClick={dismiss}
            className="grid size-5 place-items-center rounded-md text-text-muted hover:bg-surface-hover hover:text-text"
            aria-label={t("announcement.dismiss")}
            title={t("announcement.dismiss")}
          >
            <Icon name="close" className="size-2.5" />
          </button>
        )}
      </div>
    </section>
  );
}
