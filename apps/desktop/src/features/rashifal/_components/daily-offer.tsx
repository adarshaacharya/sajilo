import { useEffect, useState } from "react";
import { Icon } from "../../../shared/components/icon";
import { useSettings } from "../../../shared/context/settings-context";
import { api, type NotificationOptions } from "../../../shared/lib/ipc";

/** Set once the offer has been answered either way, so it is asked once. */
const ASKED_KEY = "rashifalReminderAsked";

/**
 * Asked once someone has a sign: would they like today's reading each
 * morning? Turning it on here is the whole opt-in; Settings keeps the switch
 * for later. Hidden until both answers are read, so it never flashes up for
 * someone who already said yes or no.
 */
export function DailyOffer({ signName }: { signName: string }) {
  const { t } = useSettings();
  const [options, setOptions] = useState<NotificationOptions | null>(null);
  const [asked, setAsked] = useState<boolean | null>(null);
  const [turnedOn, setTurnedOn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getNotificationOptions()
      .then((next) => {
        if (!cancelled) setOptions(next);
      })
      .catch(() => {});
    api
      .getSetting<boolean>(ASKED_KEY)
      .then((value) => {
        if (!cancelled) setAsked(value === true);
      })
      .catch(() => {
        if (!cancelled) setAsked(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const answer = (yes: boolean) => {
    setAsked(true);
    api.setSetting(ASKED_KEY, true).catch(() => {});
    if (yes && options) {
      setTurnedOn(true);
      api.setNotificationOptions({ ...options, dailyRashifal: true }).catch(() => {});
    }
  };

  if (turnedOn) {
    return (
      <p className="surface-card flex items-center gap-2 px-3 py-2.5 text-[11.5px] text-text-secondary">
        <Icon name="checkmark" className="size-3.5 shrink-0 text-accent" />
        {t("rashifal.daily.on")}
      </p>
    );
  }
  if (!options || asked !== false || options.dailyRashifal) return null;

  return (
    <section className="surface-card p-3.5">
      <div className="flex items-start gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
          <Icon name="rashifal" className="size-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold leading-snug">{t("rashifal.daily.title")}</h2>
          <p className="mt-1 text-[11.5px] leading-relaxed text-text-secondary">
            {t("rashifal.daily.body").replace("{sign}", signName)}
          </p>
        </div>
      </div>
      {/* The way out on the left, the main action on the right, as in
          Routine's own one-time question. */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => answer(false)}
          className="settings-btn w-full justify-center text-center text-[12px]"
        >
          {t("rashifal.daily.skip")}
        </button>
        <button
          type="button"
          onClick={() => answer(true)}
          className="settings-btn settings-btn--accent w-full justify-center text-center text-[12px]"
        >
          {t("rashifal.daily.yes")}
        </button>
      </div>
    </section>
  );
}
