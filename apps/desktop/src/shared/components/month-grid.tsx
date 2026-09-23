import { useEffect, useRef } from "react";
import type { NepaliDate } from "../../types/api/NepaliDate";
import { useSettings } from "../context/settings-context";
import type { CalendarDay, CalendarMonth } from "../lib/ipc";
import { digits } from "../lib/numerals";

/** Swift MonthCalendarView weekday symbols. */
export const WEEKDAYS_NE = ["आ", "सो", "मं", "बु", "बि", "शु", "श"];
export const WEEKDAYS_EN = ["S", "M", "T", "W", "T", "F", "S"];
const WEEKDAY_IDS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function MonthGrid({
  month,
  planDays,
  onSelect,
  selected,
  focused,
  isDisabled,
}: {
  month: CalendarMonth;
  planDays?: Set<string>;
  onSelect: (day: CalendarDay) => void;
  /** Marks the day a picker currently holds, distinct from today. */
  selected?: NepaliDate | null;
  /**
   * The day the keyboard is on. A picker moves this with the arrow keys; the
   * grid then carries the only tab stop and the DOM focus, which is the
   * roving-tabindex pattern a date grid is expected to follow.
   */
  focused?: NepaliDate | null;
  /** Days that cannot be chosen — a trade dated in the future, say. */
  isDisabled?: (day: CalendarDay) => boolean;
}) {
  const { numerals, language } = useSettings();
  const weekdays = language === "en" ? WEEKDAYS_EN : WEEKDAYS_NE;
  const cells = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    if (!focused) return;
    cells.current.get(dayKey(focused))?.focus();
  }, [focused]);

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 pb-1.5">
        {weekdays.map((label, index) => (
          <div
            key={WEEKDAY_IDS[index]}
            className={`text-center text-[11px] font-semibold ${
              index === 6 ? "text-holiday" : "text-text-secondary"
            }`}
          >
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {month.days.map((day) => {
          const disabled = day.date != null && (isDisabled?.(day) ?? false);
          const isSelected =
            selected != null &&
            day.date != null &&
            day.date.year === selected.year &&
            day.date.month === selected.month &&
            day.date.day === selected.day;
          const hasFocus =
            focused != null && day.date != null && dayKey(day.date) === dayKey(focused);
          return day.date ? (
            <button
              type="button"
              key={day.id}
              ref={(node) => {
                if (day.date == null) return;
                const key = dayKey(day.date);
                if (node) cells.current.set(key, node);
                else cells.current.delete(key);
              }}
              tabIndex={focused == null ? undefined : hasFocus ? 0 : -1}
              onClick={() => onSelect(day)}
              disabled={disabled}
              aria-current={isSelected ? "date" : undefined}
              title={day.eventName ?? day.tithi ?? undefined}
              className={`relative flex h-[34px] flex-col items-center justify-center rounded-md transition-all duration-200 ${
                disabled
                  ? "cursor-default opacity-30"
                  : day.isToday
                    ? "cal-today"
                    : day.isHoliday
                      ? "font-medium text-holiday hover:bg-holiday/12"
                      : "hover:bg-surface-hover"
              } ${
                isSelected && !day.isToday
                  ? "ring-1 ring-[color:var(--color-accent-mark)] ring-inset"
                  : ""
              }`}
            >
              <span className="text-[13px] leading-none font-medium">
                {digits(day.date.day, numerals)}
              </span>
              <span
                className={`text-[9px] leading-none ${
                  day.isToday
                    ? "text-accent-ink/70"
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
                    day.isToday ? "bg-accent-ink" : "bg-[color:var(--color-accent-mark)]"
                  }`}
                />
              )}
            </button>
          ) : (
            <div key={day.id} className="h-[34px]" />
          );
        })}
      </div>
    </div>
  );
}

function dayKey(date: NepaliDate): string {
  return `${date.year}-${date.month}-${date.day}`;
}
