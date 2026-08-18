import type { CalendarDay, CalendarMonth } from "../../lib/ipc";
import { digits } from "../../lib/numerals";
import { useSettings } from "../../lib/settings";

/** Swift MonthCalendarView weekday symbols. */
const WEEKDAYS_NE = ["आ", "सो", "मं", "बु", "बि", "शु", "श"];
const WEEKDAYS_EN = ["S", "M", "T", "W", "T", "F", "S"];

export function MonthGrid({
  month,
  planDays,
  onSelect,
}: {
  month: CalendarMonth;
  planDays?: Set<string>;
  onSelect: (day: CalendarDay) => void;
}) {
  const { numerals, language } = useSettings();
  const weekdays = language === "en" ? WEEKDAYS_EN : WEEKDAYS_NE;

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 pb-1.5">
        {weekdays.map((label, index) => (
          <div
            key={`${label}-${index}`}
            className={`text-center text-[11px] font-semibold ${
              index === 6 ? "text-holiday" : "text-text-secondary"
            }`}
          >
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {month.days.map((day) =>
          day.date ? (
            <button
              type="button"
              key={day.id}
              onClick={() => onSelect(day)}
              title={day.eventName ?? day.tithi ?? undefined}
              className={`relative flex h-[34px] flex-col items-center justify-center rounded-md transition-colors ${
                day.isToday
                  ? "bg-accent text-white hover:bg-accent"
                  : day.isHoliday
                    ? "font-medium text-holiday hover:bg-holiday/10"
                    : "hover:bg-surface-hover"
              }`}
            >
              <span className="text-[13px] leading-none font-medium">
                {digits(day.date.day, numerals)}
              </span>
              <span
                className={`text-[9px] leading-none ${
                  day.isToday
                    ? "text-white/70"
                    : day.isHoliday
                      ? "text-holiday/70"
                      : "text-text-muted"
                }`}
              >
                {day.adDay}
              </span>
              {planDays?.has(`${day.date.year}-${day.date.month}-${day.date.day}`) && (
                <span
                  className={`absolute bottom-0.5 size-1 rounded-full ${
                    day.isToday ? "bg-white" : "bg-[color:var(--color-accent-mark)]"
                  }`}
                />
              )}
            </button>
          ) : (
            <div key={day.id} className="h-[34px]" />
          ),
        )}
      </div>
    </div>
  );
}
