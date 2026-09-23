import { CONTROL, CONTROL_LABEL } from "../../../shared/components/control";
import { WEEKDAYS_EN, WEEKDAYS_NE } from "../../../shared/components/month-grid";
import { Toggle } from "../../../shared/components/toggle";
import { useSettings } from "../../../shared/context/settings-context";
import type { FocusSettings } from "../../../shared/lib/ipc";
import { clock, parseClock } from "../_lib/format";

export function ScheduleCard({
  settings,
  onSettings,
}: {
  settings: FocusSettings;
  onSettings: (settings: FocusSettings) => void;
}) {
  const { language, t } = useSettings();
  const weekdays = language === "ne" ? WEEKDAYS_NE : WEEKDAYS_EN;

  const setTime = (field: "workStart" | "workEnd", value: string) => {
    const time = parseClock(value);
    if (time) onSettings({ ...settings, [field]: time });
  };

  return (
    <section className="surface-card space-y-3 p-3">
      <div>
        <h2 className="text-[11px] font-semibold text-text-secondary">{t("focus.schedule")}</h2>
        <p className="mt-0.5 text-[10px] text-text-muted">{t("focus.schedule-note")}</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="block min-w-0">
          <span className={CONTROL_LABEL}>{t("focus.from")}</span>
          <input
            type="time"
            value={clock(settings.workStart)}
            onChange={(event) => setTime("workStart", event.target.value)}
            className={CONTROL}
          />
        </label>
        <label className="block min-w-0">
          <span className={CONTROL_LABEL}>{t("focus.to")}</span>
          <input
            type="time"
            value={clock(settings.workEnd)}
            onChange={(event) => setTime("workEnd", event.target.value)}
            className={CONTROL}
          />
        </label>
      </div>

      <div>
        <span className={CONTROL_LABEL}>{t("focus.days")}</span>
        <div className="flex justify-between gap-1">
          {weekdays.map((label, index) => {
            const on = settings.workDays[index] ?? false;
            return (
              <button
                // biome-ignore lint/suspicious/noArrayIndexKey: the seven weekdays never reorder
                key={index}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  onSettings({
                    ...settings,
                    workDays: settings.workDays.map((day, i) => (i === index ? !day : day)),
                  })
                }
                className={`toggle-chip size-8 min-w-0 rounded-full p-0 ${
                  on ? "toggle-chip--on" : "toggle-chip--off"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <Toggle
        label={t("focus.skip-holidays")}
        note={t("focus.skip-holidays-note")}
        checked={settings.skipPublicHolidays}
        onChange={(skipPublicHolidays) => onSettings({ ...settings, skipPublicHolidays })}
      />
    </section>
  );
}
