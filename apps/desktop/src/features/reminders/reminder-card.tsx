import { useCallback, useEffect, useState } from "react";
import { Icon, type IconName } from "../../shared/components/icon";
import { useSettings } from "../../shared/context/settings-context";
import { api, type ReminderCardView, type ReminderKind } from "../../shared/lib/ipc";
import { digits } from "../../shared/lib/numerals";
import { useFitWindow } from "../../shared/lib/use-fit-window";
import { useSentenceNumerals } from "../focus/_lib/format";

const ICONS: Record<ReminderKind, IconName> = {
  plan: "calendar",
  festival: "festival",
  holiday: "holiday",
  ipo: "interest",
  sip: "banknote",
  keeper: "keeper",
};

/** Where "Open" takes the popover for each kind of reminder. */
const ROUTES: Record<ReminderKind, string> = {
  plan: "/",
  festival: "/",
  holiday: "/",
  ipo: "/bazar",
  sip: "/bazar",
  keeper: "/keeper",
};

const KIND_LABELS = {
  plan: "reminder.kind.plan",
  festival: "reminder.kind.festival",
  holiday: "reminder.kind.holiday",
  ipo: "reminder.kind.ipo",
  sip: "reminder.kind.sip",
  keeper: "reminder.kind.keeper",
} as const satisfies Record<ReminderKind, string>;

/** Festival and holiday titles are ours, so they follow the language; the
 * rest are the user's own words or a fund's name. */
const TRANSLATED_TITLES = {
  festival: "reminder.festival-tomorrow",
  holiday: "reminder.holiday-tomorrow",
} as const;

/** Shell event: the reminder in front changed (dismissed, or an example). */
const CHANGED_EVENT = "sajilo://reminder-changed";
/** A card still waiting after this long shakes once more. */
const NUDGE_MS = 30_000;

/**
 * A festival, day plan, Keeper, IPO or SIP reminder as a card: the same small
 * unfocused window as a break, at the same spot, staying until it is dealt
 * with. Reminders that came due together follow each other in this card.
 */
export function ReminderCard() {
  const { t } = useSettings();
  const numerals = useSentenceNumerals();
  const [view, setView] = useState<ReminderCardView | null>(null);
  const [busy, setBusy] = useState(false);
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  useFitWindow(element);

  const load = useCallback(() => {
    api
      .currentReminder()
      .then((next) => {
        setView(next);
        setBusy(false);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void import("@tauri-apps/api/event")
      .then(({ listen }) => listen(CHANGED_EVENT, load))
      .then((stop) => {
        if (cancelled) stop();
        else unlisten = stop;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [load]);

  // Shakes as it arrives and once more if still waiting, like the break card.
  const [shakes, setShakes] = useState(0);
  const id = view?.reminder.id;
  useEffect(() => {
    if (!id) return;
    const timer = window.setTimeout(() => setShakes((count) => count + 1), NUDGE_MS);
    return () => window.clearTimeout(timer);
  }, [id]);

  if (!view) return null;
  const { reminder } = view;
  const titleKey =
    reminder.kind === "festival" || reminder.kind === "holiday"
      ? TRANSLATED_TITLES[reminder.kind]
      : null;

  const dismiss = (open: boolean) => {
    if (busy) return;
    setBusy(true);
    api.dismissReminder(open ? ROUTES[reminder.kind] : null).catch(() => setBusy(false));
  };

  return (
    <div
      key={`${reminder.id}.${shakes}`}
      ref={setElement}
      className={`break-card reminder-card--${reminder.kind}`}
      role="alert"
      data-tauri-drag-region
    >
      <div className="flex items-start gap-3" data-tauri-drag-region>
        <span className="break-card__icon" data-tauri-drag-region>
          <Icon name={ICONS[reminder.kind]} className="size-5" />
        </span>
        <div className="min-w-0 flex-1" data-tauri-drag-region>
          <p className="break-card__eyebrow" data-tauri-drag-region>
            {t(KIND_LABELS[reminder.kind])}
            {view.preview && <span className="break-card__example">{t("break.example")}</span>}
          </p>
          <p className="break-card__title" data-tauri-drag-region>
            {titleKey ? t(titleKey) : reminder.title}
          </p>
          {reminder.body && (
            <p className="break-card__body" data-tauri-drag-region>
              {reminder.body}
            </p>
          )}
        </div>
      </div>

      <div className="break-card__actions" data-tauri-drag-region>
        <span className="mr-auto text-[11px] text-text-muted" data-tauri-drag-region>
          {view.waiting > 0 && t("reminder.more").replace("{n}", digits(view.waiting, numerals))}
        </span>
        <button
          type="button"
          onClick={() => dismiss(true)}
          disabled={busy}
          className="break-card__button break-card__button--quiet"
        >
          {t("reminder.open")}
        </button>
        <button
          type="button"
          onClick={() => dismiss(false)}
          disabled={busy}
          className="break-card__button break-card__button--main"
        >
          {t("reminder.dismiss")}
        </button>
      </div>
    </div>
  );
}
