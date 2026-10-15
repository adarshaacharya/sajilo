import { useEffect, useState } from "react";
import { Icon } from "../../../shared/components/icon";
import { useSettings } from "../../../shared/context/settings-context";
import { api, type NotificationOptions, type PlanTime } from "../../../shared/lib/ipc";
import { ReadingTime, useReadingTimeText } from "../reading-time";

/** Set once the offer has been answered either way, so it is asked once. */
const ASKED_KEY = "rashifalReminderAsked";

/**
 * The daily reading, on the Rashifal screen itself.
 *
 * Asked once someone has a sign: would they like today's reading each day,
 * and when? Turning it on here is the whole opt-in. Once on, it stays as one
 * slim line saying when it comes, with the time a tap away, so changing it
 * never means a trip to Settings. Hidden until both answers are read, so it
 * never flashes up for someone who already said yes or no.
 */
export function DailyOffer({ signName }: { signName: string }) {
  const { t } = useSettings();
  const [options, setOptions] = useState<NotificationOptions | null>(null);
  const [asked, setAsked] = useState<boolean | null>(null);
  const [time, setTime] = useState<PlanTime | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getNotificationOptions()
      .then((next) => {
        if (cancelled) return;
        setOptions(next);
        setTime(next.rashifalTime ?? null);
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

  const save = (next: NotificationOptions) => {
    setOptions(next);
    api.setNotificationOptions(next).catch(() => {});
  };

  const answer = (yes: boolean) => {
    setAsked(true);
    api.setSetting(ASKED_KEY, true).catch(() => {});
    if (yes && options) save({ ...options, dailyRashifal: true, rashifalTime: time });
  };

  if (!options || asked === null) return null;
  if (options.dailyRashifal) {
    return (
      <DailyLine
        time={options.rashifalTime ?? null}
        onTime={(next) => save({ ...options, rashifalTime: next })}
        onOff={() => save({ ...options, dailyRashifal: false })}
      />
    );
  }
  if (asked) return null;

  return (
    <section className="surface-card p-3.5">
      <div className="flex items-start gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
          <Icon name="rashifal" className="size-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold leading-snug">
            {t("rashifal.daily.title").replace("{sign}", signName)}
          </h2>
          <p className="mt-0.5 text-[11.5px] leading-snug text-text-secondary">
            {t("rashifal.daily.body")}
          </p>
        </div>
      </div>
      <div className="mt-3">
        <ReadingTime value={time} onChange={setTime} />
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

/** "Daily reading · at 07:00 · Change", opening the same picker in place. */
function DailyLine({
  time,
  onTime,
  onOff,
}: {
  time: PlanTime | null;
  onTime: (next: PlanTime | null) => void;
  onOff: () => void;
}) {
  const { t } = useSettings();
  const timeText = useReadingTimeText();
  const [open, setOpen] = useState(false);

  return (
    <section className="surface-card px-3 py-2.5">
      <div className="flex items-center gap-2">
        <Icon name="bell" className="size-3.5 shrink-0 text-accent" />
        <p className="min-w-0 flex-1 truncate text-[11.5px]">
          <span className="text-text-secondary">{t("rashifal.daily.line")} · </span>
          {timeText(time)}
        </p>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="shrink-0 text-[11px] font-medium text-accent"
        >
          {t(open ? "rashifal.daily.done" : "rashifal.daily.change")}
        </button>
      </div>
      {open && (
        <div className="mt-2.5 space-y-2.5">
          <ReadingTime value={time} onChange={onTime} />
          <button
            type="button"
            onClick={onOff}
            className="text-[11px] text-text-muted transition-colors hover:text-text-secondary"
          >
            {t("rashifal.daily.turn-off")}
          </button>
        </div>
      )}
    </section>
  );
}
