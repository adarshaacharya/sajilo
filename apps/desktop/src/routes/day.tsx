import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { DateSummaryPanel } from "../components/day/DateSummaryPanel";
import { DayPlanSection } from "../components/day/DayPlanSection";
import { PanchangaPanel } from "../components/day/PanchangaPanel";
import { isSaturday } from "../lib/dayDetail";
import { api, type CalendarEvent, type Conversion, type DayPlan, type Panchanga } from "../lib/ipc";
import { useSettings } from "../lib/settings";

export function DayDetail() {
  const { numerals, t } = useSettings();
  const [params] = useSearchParams();
  const [date, setDate] = useState<{ year: number; month: number; day: number } | null>(null);
  const [conversion, setConversion] = useState<Conversion | null>(null);
  const [event, setEvent] = useState<CalendarEvent | null>(null);
  const [panchanga, setPanchanga] = useState<Panchanga | null>(null);
  const [plans, setPlans] = useState<DayPlan[]>([]);

  useEffect(() => {
    const year = Number(params.get("y"));
    const month = Number(params.get("m"));
    const day = Number(params.get("d"));
    if (year && month && day) {
      setDate({ year, month, day });
    } else {
      api
        .today()
        .then(({ nepali }) => setDate(nepali))
        .catch(() => {});
    }
  }, [params]);

  useEffect(() => {
    if (!date) return;
    api
      .bsToAd(date.year, date.month, date.day)
      .then(setConversion)
      .catch(() => setConversion(null));
    api
      .eventsFor(date.year, date.month, date.day)
      .then(setEvent)
      .catch(() => setEvent(null));
    api
      .plansForDay(date.year, date.month, date.day)
      .then(setPlans)
      .catch(() => setPlans([]));
  }, [date]);

  useEffect(() => {
    if (!conversion) {
      setPanchanga(null);
      return;
    }
    api
      .panchangaFor(conversion.gregorian)
      .then(setPanchanga)
      .catch(() => setPanchanga(null));
  }, [conversion]);

  if (!date || !conversion) {
    return <p className="px-0.5 text-text-muted">…</p>;
  }

  const showNoEvent =
    !event?.name && !event?.tithi && !event?.is_public_holiday && !isSaturday(conversion.gregorian);

  return (
    <div className="space-y-2.5">
      <DateSummaryPanel conversion={conversion} event={event} numerals={numerals} />

      {showNoEvent && (
        <p className="flex items-center gap-1.5 px-0.5 text-[11px] text-text-muted">
          <span className="opacity-70">ⓘ</span>
          {t("calendar.no-event")}
        </p>
      )}

      {panchanga && <PanchangaPanel panchanga={panchanga} />}

      <DayPlanSection
        date={date}
        plans={plans}
        startAdding={params.get("add") === "1"}
      />
    </div>
  );
}
