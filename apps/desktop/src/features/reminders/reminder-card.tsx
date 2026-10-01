import { useCallback, useEffect, useState } from "react";
import { Icon, type IconName } from "../../shared/components/icon";
import { useSettings } from "../../shared/context/settings-context";
import {
  api,
  type NotificationOptions,
  type ReminderCardView,
  type ReminderKind,
} from "../../shared/lib/ipc";
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
  rashifal: "rashifal",
};

/** Where "Open" takes the popover for each kind of reminder. */
const ROUTES: Record<ReminderKind, string> = {
  plan: "/",
  festival: "/",
  holiday: "/",
  ipo: "/bazar",
  sip: "/bazar",
  keeper: "/keeper",
  rashifal: "/rashifal",
};

const KIND_LABELS = {
  plan: "reminder.kind.plan",
  festival: "reminder.kind.festival",
  holiday: "reminder.kind.holiday",
  ipo: "reminder.kind.ipo",
  sip: "reminder.kind.sip",
  keeper: "reminder.kind.keeper",
  rashifal: "reminder.kind.rashifal",
} as const satisfies Record<ReminderKind, string>;

/** Festival and holiday titles are ours, so they follow the language; the
 * rest are the user's own words or a fund's name. */
const TRANSLATED_TITLES = {
  festival: "reminder.festival-tomorrow",
  holiday: "reminder.holiday-tomorrow",
} as const;

/** The Settings › Notifications switch behind each kind of card. */
const SWITCHES: Record<ReminderKind, keyof NotificationOptions> = {
  plan: "dayPlans",
  festival: "eveOfFestival",
  holiday: "eveOfPublicHoliday",
  ipo: "ipoClosingDay",
  sip: "sipPayment",
  keeper: "keeper",
  rashifal: "dailyRashifal",
};

const TURN_OFF_LABELS = {
  plan: "reminder.off.plan",
  festival: "reminder.off.festival",
  holiday: "reminder.off.holiday",
  ipo: "reminder.off.ipo",
  sip: "reminder.off.sip",
  keeper: "reminder.off.keeper",
  rashifal: "reminder.off.rashifal",
} as const satisfies Record<ReminderKind, string>;

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
  // The ⋯ choices replace the buttons in place: the card is its own small
  // window, sized to fit, so a dropdown would be cut off.
  const [options, setOptions] = useState(false);
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  useFitWindow(element);

  const load = useCallback(() => {
    api
      .currentReminder()
      .then((next) => {
        setView(next);
        setBusy(false);
        setOptions(false);
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

  // The reading is the point of this card, so its button says so.
  const openLabel = reminder.kind === "rashifal" ? "reminder.read" : "reminder.open";

  /** Closes the card, opening the popover at `route` if given. */
  const close = (route: string | null) => {
    if (busy) return;
    setBusy(true);
    api.dismissReminder(route).catch(() => setBusy(false));
  };
  const dismiss = (open: boolean) => close(open ? ROUTES[reminder.kind] : null);
  /** Switches this kind off, as Settings › Notifications would, and moves on. */
  const turnOff = async () => {
    if (busy) return;
    if (!view.preview) {
      const current = await api.getNotificationOptions().catch(() => null);
      if (current) {
        await api
          .setNotificationOptions({ ...current, [SWITCHES[reminder.kind]]: false })
          .catch(() => {});
      }
    }
    close(null);
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
          {/* A festival or holiday title already says what it is. */}
          {(!titleKey || view.preview) && (
            <p className="break-card__eyebrow" data-tauri-drag-region>
              {!titleKey && t(KIND_LABELS[reminder.kind])}
              {view.preview && <span className="break-card__example">{t("break.example")}</span>}
            </p>
          )}
          <p className="break-card__title" data-tauri-drag-region>
            {titleKey ? t(titleKey) : reminder.title}
          </p>
          {reminder.body && (
            <p className="break-card__body" data-tauri-drag-region>
              {reminder.body}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setOptions((open) => !open)}
          aria-expanded={options}
          aria-label={t("reminder.options")}
          title={t("reminder.options")}
          className="reminder-card__more"
        >
          <Icon name="ellipsis" className="size-3.5" />
        </button>
      </div>

      {options ? (
        <div className="reminder-card__options">
          <button type="button" onClick={() => void turnOff()} disabled={busy}>
            {t(TURN_OFF_LABELS[reminder.kind])}
          </button>
          <button type="button" onClick={() => close("/settings/notifications")} disabled={busy}>
            {t("reminder.settings")}
          </button>
        </div>
      ) : (
        <div className="break-card__actions" data-tauri-drag-region>
          <span className="mr-auto flex min-w-0 items-center gap-1.5 text-[11px] text-text-muted">
            {view.waiting > 0 && (
              <span data-tauri-drag-region>
                {t("reminder.more").replace("{n}", digits(view.waiting, numerals))} ·
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={() => dismiss(true)}
            disabled={busy}
            className="break-card__button break-card__button--quiet"
          >
            {t(openLabel)}
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
      )}
    </div>
  );
}
