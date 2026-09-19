import { useSettings } from "../../../shared/context/settings-context";
import type { CalendarEvent, Conversion } from "../../../shared/lib/ipc";
import { digits } from "../../../shared/lib/numerals";
import { gregorianLongText } from "../_lib/copy-formats";
import { CompactCopyRow } from "./compact-copy-row";

const WEEKDAYS_NE = ["आइतबार", "सोमबार", "मंगलबार", "बुधबार", "बिहिबार", "शुक्रबार", "शनिबार"];
const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * The day itself: the same date tile as the home header, so the two read as one
 * app, with the month, the AD date and the tithi beside it. A festival gets a
 * band of its own — sindoor on a holiday, gilt otherwise — instead of one more
 * line of equal weight. Where the day sits relative to today, and the arrows to
 * the days either side, ride along the top.
 */
export function DateSummaryPanel({
  conversion,
  event,
  relative,
  onStep,
}: {
  conversion: Conversion;
  event: CalendarEvent | null;
  relative: string | null;
  onStep: (offset: -1 | 1) => void;
}) {
  const { t, numerals, language } = useSettings();
  const weekly = conversion.weeklyHoliday ?? null;
  const holiday = Boolean(event?.is_public_holiday);
  const weekday =
    language === "en" ? WEEKDAYS_EN[conversion.weekday] : WEEKDAYS_NE[conversion.weekday];

  return (
    <section className="surface-card p-3">
      <div className="flex items-start gap-3">
        <div className="date-plate flex w-[54px] shrink-0 flex-col items-center rounded-xl border py-1.5">
          <span
            className={`text-[28px] font-bold leading-none ${
              holiday || weekly ? "text-holiday" : "text-[color:var(--color-accent-mark)]"
            }`}
          >
            {digits(conversion.nepali.day, numerals)}
          </span>
          <span className="mt-0.5 text-[10px] text-text-secondary">{weekday}</span>
        </div>

        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-[18px] font-semibold leading-tight">
            {conversion.nepaliMonthName} {digits(conversion.nepali.year, numerals)}
          </p>
          <p className="mt-0.5 text-[11px] text-text-secondary">
            {gregorianLongText(conversion.gregorian)}
          </p>
          {event?.tithi && (
            <p className="mt-1 text-[10px] text-text-muted">
              {t("calendar.tithi")}{" "}
              <span className="text-[11px] text-text-secondary">{event.tithi}</span>
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => onStep(-1)}
              aria-label={t("calendar.previous-day")}
              className="icon-btn size-6"
            >
              <span className="text-[14px] leading-none">‹</span>
            </button>
            <button
              type="button"
              onClick={() => onStep(1)}
              aria-label={t("calendar.next-day")}
              className="icon-btn size-6"
            >
              <span className="text-[14px] leading-none">›</span>
            </button>
          </div>
          {relative && <span className="text-[10px] text-text-muted">{relative}</span>}
        </div>
      </div>

      {event?.name && (
        <div
          // No icon: a day of mourning (Shahid Diwas) is marked here as much
          // as a festival, and any glyph reads as one or the other.
          className={`mt-2.5 flex items-center gap-2 rounded-lg px-2.5 py-2 ${
            holiday
              ? "bg-[color-mix(in_srgb,var(--color-holiday)_14%,transparent)] text-holiday"
              : "bg-[color-mix(in_srgb,var(--color-accent-mark)_12%,transparent)]"
          }`}
        >
          <p className="min-w-0 flex-1 text-[13px] leading-snug">{event.name}</p>
          {holiday && (
            <span className="shrink-0 text-[10px] font-medium">{t("calendar.public-holiday")}</span>
          )}
        </div>
      )}
      {(weekly || (holiday && !event?.name)) && (
        <p className="mt-2 flex items-center gap-1.5 text-[10px] text-holiday">
          <span className="size-1.5 shrink-0 rounded-full bg-holiday" />
          <span className="font-medium">
            {holiday && !event?.name
              ? t("calendar.public-holiday")
              : weekly === "sunday"
                ? t("calendar.sunday-holiday")
                : t("calendar.saturday-holiday")}
          </span>
          {weekly === "sunday" && !holiday && (
            <span className="text-text-muted">{t("calendar.sunday-holiday-note")}</span>
          )}
        </p>
      )}

      <div className="section-divider mt-2.5 pt-2">
        <CompactCopyRow conversion={conversion} />
      </div>
    </section>
  );
}
