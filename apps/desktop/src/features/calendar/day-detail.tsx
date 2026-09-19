import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { useSettings } from "../../shared/context/settings-context";
import {
  api,
  type CalendarEvent,
  type Conversion,
  type DayPlan,
  type Panchanga,
} from "../../shared/lib/ipc";
import { digits } from "../../shared/lib/numerals";
import { AlmanacPanel } from "./_components/almanac-panel";
import { DateSummaryPanel } from "./_components/date-summary-panel";
import { DayPlanSection } from "./_components/day-plan-section";
import { PanchangaPanel } from "./_components/panchanga-panel";

export function DayDetail() {
  const { numerals, t } = useSettings();
  const [params, setParams] = useSearchParams();
  const [todayIso, setTodayIso] = useState<string | null>(null);
  const [date, setDate] = useState<{ year: number; month: number; day: number } | null>(null);
  const [conversion, setConversion] = useState<Conversion | null>(null);
  const [event, setEvent] = useState<CalendarEvent | null>(null);
  const [panchanga, setPanchanga] = useState<Panchanga | null>(null);
  const [plans, setPlans] = useState<DayPlan[]>([]);

  useEffect(() => {
    api
      .today()
      .then(({ gregorian }) => setTodayIso(gregorian))
      .catch(() => {});
  }, []);

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
    !event?.name && !event?.tithi && !event?.is_public_holiday && !conversion.weeklyHoliday;
  const offset = todayIso === null ? null : daysBetween(todayIso, conversion.gregorian);

  // The neighbouring day comes from Rust by way of its AD date: stepping a
  // Gregorian day is plain arithmetic, the BS date it lands on is not. Replaces
  // the history entry, so Back still returns to wherever this was opened from.
  const step = (by: -1 | 1) => {
    const next = new Date(`${conversion.gregorian}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + by);
    api
      .adToBs(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate())
      .then(({ nepali }) =>
        setParams(
          { y: String(nepali.year), m: String(nepali.month), d: String(nepali.day) },
          {
            replace: true,
          },
        ),
      )
      .catch(() => {});
  };

  return (
    <div className="space-y-2.5">
      <DateSummaryPanel
        conversion={conversion}
        event={event}
        relative={offset === null ? null : relativeText(offset, t, numerals)}
        onStep={step}
      />

      {showNoEvent && (
        <p className="flex items-center gap-1.5 px-0.5 text-[11px] text-text-muted">
          <span className="opacity-70">ⓘ</span>
          {t("calendar.no-event")}
        </p>
      )}

      {panchanga?.almanac && (
        <AlmanacPanel almanac={panchanga.almanac} date={conversion.gregorian} />
      )}

      {panchanga && <PanchangaPanel panchanga={panchanga} isToday={offset === 0} />}

      <DayPlanSection date={date} plans={plans} startAdding={params.get("add") === "1"} />
    </div>
  );
}

/** Whole days from one ISO date to another. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function relativeText(
  offset: number,
  t: ReturnType<typeof useSettings>["t"],
  numerals: ReturnType<typeof useSettings>["numerals"],
): string {
  if (offset === 0) return t("relative.today");
  if (offset === 1) return t("relative.tomorrow");
  if (offset === -1) return t("relative.yesterday");
  const n = digits(Math.abs(offset), numerals);
  return offset > 0
    ? t("relative.in-days").replace("{n}", n)
    : t("relative.days-ago").replace("{n}", n);
}
