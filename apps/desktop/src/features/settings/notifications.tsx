import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Icon } from "../../shared/components/icon";
import { Segmented } from "../../shared/components/segmented";
import { Switch } from "../../shared/components/switch";
import { useSettings } from "../../shared/context/settings-context";
import type { translate } from "../../shared/lib/i18n";
import {
  api,
  type NotificationOptions,
  type PauseFor,
  type PermissionState,
  type ReminderStyle,
} from "../../shared/lib/ipc";
import { SettingsSection } from "./_components/settings-section";

type TranslationKey = Parameters<typeof translate>[0];

/** The switches here, by the option each one sets. */
type Source = keyof Pick<
  NotificationOptions,
  | "eveOfPublicHoliday"
  | "eveOfFestival"
  | "ipoClosingDay"
  | "sipPayment"
  | "dayPlans"
  | "keeper"
  | "dailyRashifal"
>;

const GROUPS: {
  titleKey: TranslationKey;
  rows: { source: Source; labelKey: TranslationKey; whenKey: TranslationKey }[];
}[] = [
  {
    titleKey: "notifications.group.calendar",
    rows: [
      {
        source: "eveOfPublicHoliday",
        labelKey: "reminder.holiday-tomorrow",
        whenKey: "notifications.when.evening-before",
      },
      {
        source: "eveOfFestival",
        labelKey: "reminder.festival-tomorrow",
        whenKey: "notifications.when.evening-before",
      },
    ],
  },
  {
    titleKey: "notifications.group.money",
    rows: [
      {
        source: "ipoClosingDay",
        labelKey: "reminder.ipo-closing-day",
        whenKey: "notifications.when.ipo",
      },
      { source: "sipPayment", labelKey: "reminder.sip-payment", whenKey: "notifications.when.sip" },
    ],
  },
  {
    titleKey: "notifications.group.yours",
    rows: [
      {
        source: "dayPlans",
        labelKey: "notifications.day-plans",
        whenKey: "notifications.when.plans",
      },
      { source: "keeper", labelKey: "notifications.keeper", whenKey: "notifications.when.keeper" },
    ],
  },
  {
    titleKey: "notifications.group.daily",
    rows: [
      {
        source: "dailyRashifal",
        labelKey: "reminder.daily-rashifal",
        whenKey: "notifications.when.rashifal",
      },
    ],
  },
];

/** Every source counted by the summary on Settings. */
export const SOURCES: Source[] = GROUPS.flatMap((group) => group.rows.map((row) => row.source));

/** `14:30`, in the computer's own clock: when a pause ends, as the user reads time. */
function clockText(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/**
 * Settings › Notifications: every reminder Sajilo can send, one switch each,
 * with when it comes written on the row. A pause on top for a quiet hour, and
 * how they look at the bottom, since that's set once.
 */
export function Notifications() {
  const { t } = useSettings();
  const navigate = useNavigate();
  const [options, setOptions] = useState<NotificationOptions | null>(null);
  const [hasSign, setHasSign] = useState(false);
  const [permission, setPermission] = useState<PermissionState>("unknown");
  const [, setTick] = useState(0);

  useEffect(() => {
    api
      .getNotificationOptions()
      .then(setOptions)
      .catch(() => {});
    api
      .getSetting<string>("selectedRashi")
      .then((sign) => setHasSign(typeof sign === "string" && sign.length > 0))
      .catch(() => {});
    api
      .notificationPermission()
      .then(setPermission)
      .catch(() => {});
    // A pause ends on its own; redraw so the switch notices.
    const timer = window.setInterval(() => setTick((tick) => tick + 1), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!options) return null;

  const update = async (next: NotificationOptions) => {
    // A card needs no permission; only the system notification does.
    if (next.style === "notification" && permission !== "granted") {
      setPermission(await api.requestNotificationPermission().catch(() => "denied" as const));
    }
    setOptions(next);
    await api.setNotificationOptions(next).catch(() => {});
  };

  const pause = async (pauseFor: PauseFor | null) => {
    const next = await api.pauseReminders(pauseFor).catch(() => null);
    if (next) setOptions(next);
  };

  const paused = options.pausedUntil !== null && new Date(options.pausedUntil) > new Date();

  return (
    <div className="space-y-2.5">
      <section className={`surface-card p-2.5${paused ? " notifications-paused" : ""}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12.5px] font-medium">{t("notifications.pause")}</p>
            <p className="mt-0.5 text-[10.5px] text-text-muted">
              {paused && options.pausedUntil
                ? t("notifications.paused-until").replace("{time}", clockText(options.pausedUntil))
                : t("notifications.pause-note")}
            </p>
          </div>
          <Switch
            checked={paused}
            onChange={(on) => void pause(on ? "oneDay" : null)}
            ariaLabel={t("notifications.pause")}
          />
        </div>
        {!paused && (
          <div className="mt-2 flex gap-1.5">
            <button type="button" className="day-plan-option" onClick={() => void pause("oneHour")}>
              {t("notifications.pause.hour")}
            </button>
            <button
              type="button"
              className="day-plan-option"
              onClick={() => void pause("untilTomorrow")}
            >
              {t("notifications.pause.tomorrow")}
            </button>
          </div>
        )}
      </section>

      <div className={paused ? "opacity-50 transition-opacity" : "transition-opacity"}>
        {GROUPS.map((group) => (
          <div key={group.titleKey} className="mb-2.5">
            <SettingsSection title={t(group.titleKey)}>
              {group.rows.map((row) => {
                const needsSign = row.source === "dailyRashifal" && !hasSign;
                return (
                  <div
                    key={row.source}
                    className={`flex items-center justify-between gap-3${needsSign ? " opacity-50" : ""}`}
                  >
                    <div className="min-w-0">
                      <p className="text-[12px]">{t(row.labelKey)}</p>
                      <p className="mt-0.5 text-[10px] leading-snug text-text-muted">
                        {t(needsSign ? "reminder.daily-rashifal-no-sign" : row.whenKey)}
                      </p>
                    </div>
                    <Switch
                      checked={options[row.source] && !needsSign}
                      disabled={needsSign}
                      onChange={(value) => void update({ ...options, [row.source]: value })}
                      ariaLabel={t(row.labelKey)}
                    />
                  </div>
                );
              })}
              {group.titleKey === "notifications.group.yours" && (
                <button
                  type="button"
                  onClick={() => navigate("/focus")}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <span className="min-w-0">
                    <span className="block text-[12px]">{t("notifications.routine")}</span>
                    <span className="mt-0.5 block text-[10px] leading-snug text-text-muted">
                      {t("notifications.when.routine")}
                    </span>
                  </span>
                  <Icon name="chevronRight" className="size-3 shrink-0 text-text-muted" />
                </button>
              )}
            </SettingsSection>
          </div>
        ))}
      </div>

      <SettingsSection
        title={t("notifications.look")}
        footnote={
          permission === "denied" && options.style === "notification"
            ? t("settings.reminder-denied-note")
            : t(
                options.style === "card"
                  ? "reminders.style-note.card"
                  : "reminders.style-note.notification",
              )
        }
      >
        <Segmented<ReminderStyle>
          label={t("reminders.style")}
          value={options.style}
          onChange={(style) => void update({ ...options, style })}
          options={[
            { id: "card", label: t("reminders.style.card") },
            { id: "notification", label: t("reminders.style.notification") },
          ]}
        />
        {options.style === "card" && (
          <button
            type="button"
            onClick={() => api.previewReminderCard().catch(() => {})}
            className="settings-btn"
          >
            {t("reminders.preview")}
          </button>
        )}
      </SettingsSection>
    </div>
  );
}
