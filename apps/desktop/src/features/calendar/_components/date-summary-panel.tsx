import { Icon } from "../../../shared/components/icon";
import { useSettings } from "../../../shared/context/settings-context";
import type { CalendarEvent, Conversion } from "../../../shared/lib/ipc";
import type { NumeralStyle } from "../../../shared/lib/numerals";
import { gregorianLongText, isSaturday, nepaliLongText } from "../_lib/copy-formats";
import { CompactCopyRow } from "./compact-copy-row";

export function DateSummaryPanel({
  conversion,
  event,
  numerals,
}: {
  conversion: Conversion;
  event: CalendarEvent | null;
  numerals: NumeralStyle;
}) {
  const { t } = useSettings();
  const holiday = event?.is_public_holiday || isSaturday(conversion.gregorian);
  const hasDetail = Boolean(event?.name || event?.tithi || holiday);

  return (
    <section className="surface-card day-summary p-3">
      <p className="text-[22px] font-bold leading-tight tracking-tight">
        {nepaliLongText(conversion, numerals)}
      </p>
      <p className="mt-0.5 text-[12px] text-text-secondary">
        {gregorianLongText(conversion.gregorian)}
      </p>

      {hasDetail && (
        <>
          <div className="my-2.5 h-px bg-divider" />
          <div className="space-y-1.5">
            {event?.name && (
              <div className="flex items-start gap-1.5">
                <Icon name="festival" className="mt-0.5 size-3 shrink-0 text-accent-mark" />
                <p className={`text-[13px] leading-snug ${holiday ? "text-holiday" : ""}`}>
                  {event.name}
                </p>
              </div>
            )}
            {event?.tithi && (
              <div className="flex items-baseline gap-1.5 pl-0.5">
                <span className="text-[10px] text-text-muted">{t("calendar.tithi")}</span>
                <span className="text-[12px] text-text-secondary">{event.tithi}</span>
              </div>
            )}
            {holiday && (
              <div className="flex items-center gap-1.5 pl-0.5">
                <span className="size-1.5 rounded-full bg-holiday" />
                <span className="text-[10px] font-medium text-holiday">
                  {t("calendar.public-holiday")}
                </span>
              </div>
            )}
          </div>
        </>
      )}

      <div className="my-2.5 h-px bg-divider" />
      <CompactCopyRow conversion={conversion} numerals={numerals} />
    </section>
  );
}
