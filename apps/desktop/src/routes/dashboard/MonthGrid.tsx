import type { CalendarDay, CalendarMonth } from "../../lib/ipc";
import { digits } from "../../lib/numerals";
import { useSettings } from "../../lib/settings";

const WEEKDAYS_NE = ["आइत", "सोम", "मङ्गल", "बुध", "बिहि", "शुक्र", "शनि"];
const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function MonthGrid({
  month,
  onSelect,
}: {
  month: CalendarMonth;
  onSelect: (day: CalendarDay) => void;
}) {
  const { numerals, language } = useSettings();
  const weekdays = language === "en" ? WEEKDAYS_EN : WEEKDAYS_NE;

  return (
    <div>
      <div className="grid grid-cols-7 gap-0.5 pb-1">
        {weekdays.map((label, index) => (
          <div
            key={label}
            className={`text-center text-[10px] ${
              // Saturday is Nepal's weekly holiday, so its column is marked.
              index === 6 ? "text-holiday/70" : "text-text-muted"
            }`}
          >
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {month.days.map((day) =>
          day.date ? (
            <button
              type="button"
              key={day.id}
              onClick={() => onSelect(day)}
              title={day.eventName ?? day.tithi ?? undefined}
              // Today wins the cell outright. A holiday keeps a tinted cell
              // rather than only red digits, so Saturdays and festival days
              // read as a block at a glance instead of one glyph at a time.
              className={`relative flex h-7 flex-col items-center justify-center rounded-md transition-colors ${
                day.isToday
                  ? "bg-accent text-white hover:bg-accent"
                  : day.isHoliday
                    ? "bg-holiday/10 font-medium text-holiday hover:bg-holiday/20"
                    : "hover:bg-surface-hover"
              }`}
            >
              <span className="text-[12px] leading-none">{digits(day.date.day, numerals)}</span>
              <span
                className={`text-[9px] leading-none ${
                  day.isToday
                    ? "text-white/70"
                    : day.isHoliday
                      ? "text-holiday/60"
                      : "text-text-muted"
                }`}
              >
                {day.adDay}
              </span>
            </button>
          ) : (
            // Leading padding so the 1st lands on its real weekday column.
            <div key={day.id} className="h-7" />
          ),
        )}
      </div>
    </div>
  );
}
