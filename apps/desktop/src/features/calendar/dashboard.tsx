import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Card } from "../../shared/components/card";
import { Icon } from "../../shared/components/icon";
import { MonthGrid } from "../../shared/components/month-grid";
import { SkeletonBlock } from "../../shared/components/skeleton";
import { StateBanner } from "../../shared/components/state-banner";
import { useSettings } from "../../shared/context/settings-context";
import {
  api,
  type CalendarMonth,
  type DayPlan,
  type NepaliDate,
  type Today,
  type UpcomingEvent,
} from "../../shared/lib/ipc";
import { digits } from "../../shared/lib/numerals";
import { ClockRow } from "./_components/clock-row";
import { DateHeader } from "./_components/date-header";
import { GlanceCards } from "./_components/glance-cards";

/**
 * The dashboard at its own shape, before the data lands.
 *
 * Sized to the real layout — date header, month grid, event row, glance pair —
 * so the popover opens at its final height instead of growing under the
 * pointer. This screen used to render a single `…` here, which told the user
 * nothing and then jumped.
 */
function DashboardSkeleton() {
  return (
    <div className="space-y-2.5" aria-hidden>
      <div className="surface-card p-2.5">
        <SkeletonBlock className="h-5 w-1/2" />
        <SkeletonBlock className="mt-1.5 h-3 w-1/3" />
      </div>
      <div className="surface-card calendar-panel">
        <SkeletonBlock className="mx-auto h-3 w-2/5" />
        <div className="mt-2.5 grid grid-cols-7 gap-1">
          {Array.from({ length: 42 }, (_, cell) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed grid, never reordered
            <SkeletonBlock key={cell} className="aspect-square w-full" />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <SkeletonBlock className="h-[72px] w-full rounded-[10px]" />
        <SkeletonBlock className="h-[72px] w-full rounded-[10px]" />
      </div>
    </div>
  );
}

const PROVISIONAL_YEARS = new Set([2085, 2086, 2087, 2088, 2089, 2090]);
const GREG_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function relativeText(
  daysAway: number,
  t: (key: "relative.today" | "relative.tomorrow" | "relative.in-days") => string,
  numerals: Parameters<typeof digits>[1],
): string {
  if (daysAway === 0) return t("relative.today");
  if (daysAway === 1) return t("relative.tomorrow");
  return t("relative.in-days").replace("{n}", digits(daysAway, numerals));
}

function planKey(date: NepaliDate): string {
  return `${date.year}-${date.month}-${date.day}`;
}

function gregorianSpan(first: string, last: string): string {
  const [y1, m1] = first.split("-").map(Number);
  const [y2, m2] = last.split("-").map(Number);
  if (!y1 || !m1 || !y2 || !m2) return "";
  const a = GREG_MONTHS[m1 - 1];
  const b = GREG_MONTHS[m2 - 1];
  if (y1 === y2 && m1 === m2) return `${a} ${y1}`;
  if (y1 === y2) return `${a}/${b} ${y1}`;
  return `${a} ${y1}/${b} ${y2}`;
}

export function Dashboard() {
  const { numerals, t, modules } = useSettings();
  const navigate = useNavigate();

  const [today, setToday] = useState<Today | null>(null);
  const [cursor, setCursor] = useState<NepaliDate | null>(null);
  const [month, setMonth] = useState<CalendarMonth | null>(null);
  const [monthSpan, setMonthSpan] = useState("");
  const [upcoming, setUpcoming] = useState<UpcomingEvent[]>([]);
  const [plans, setPlans] = useState<DayPlan[]>([]);
  const [error, setError] = useState<string | null>(null);

  const planDays = useMemo(() => {
    const keys = new Set<string>();
    for (const plan of plans) keys.add(planKey(plan.date));
    return keys;
  }, [plans]);

  const reload = useCallback(() => {
    setError(null);
    api
      .today()
      .then((value) => {
        setToday(value);
        setCursor(value.nepali);
      })
      .catch((cause) => setError(String(cause)));
    api
      .upcomingEvents(1)
      .then(setUpcoming)
      .catch(() => setUpcoming([]));
    api
      .listPlans()
      .then(setPlans)
      .catch(() => setPlans([]));
  }, []);

  useEffect(reload, [reload]);

  useEffect(() => {
    if (!cursor) return;
    api
      .monthGrid(cursor.year, cursor.month)
      .then(async (grid) => {
        setMonth(grid);
        const days = grid.days.filter((day) => day.date);
        const first = days[0]?.date;
        const last = days[days.length - 1]?.date;
        if (!first || !last) {
          setMonthSpan("");
          return;
        }
        const [a, b] = await Promise.all([
          api.bsToAd(first.year, first.month, first.day),
          api.bsToAd(last.year, last.month, last.day),
        ]);
        setMonthSpan(gregorianSpan(a.gregorian, b.gregorian));
      })
      .catch((cause) => setError(String(cause)));
  }, [cursor]);

  const step = (offset: number) => {
    if (!cursor) return;
    api
      .shiftMonth(cursor.year, cursor.month, offset)
      .then(setCursor)
      .catch(() => {});
  };

  if (error) {
    return <StateBanner state={{ status: "failed", message: error }} onRetry={reload} />;
  }
  if (!today || !month) return <DashboardSkeleton />;

  const provisional = cursor && PROVISIONAL_YEARS.has(cursor.year);
  const upNext = upcoming[0];

  return (
    <div className="space-y-2.5">
      <DateHeader today={today} />

      {modules.clocksEnabled && modules.clocks.length > 0 && (
        <ClockRow timeZones={modules.clocks} />
      )}
      <Card className="calendar-panel">
        <div className="mb-2 flex items-center justify-between gap-2">
          <button
            type="button"
            aria-label={t("calendar.previous-month")}
            onClick={() => step(-1)}
            className="icon-btn size-7"
          >
            <span className="text-[15px] leading-none">‹</span>
          </button>
          <span className="min-w-0 flex-1 truncate text-center text-[11px] font-semibold tracking-[0.01em] text-text-secondary">
            {month.title}
            {monthSpan ? ` · ${monthSpan}` : ""}
          </span>
          <button
            type="button"
            aria-label={t("calendar.next-month")}
            onClick={() => step(1)}
            className="icon-btn size-7"
          >
            <span className="text-[15px] leading-none">›</span>
          </button>
        </div>
        <MonthGrid
          month={month}
          planDays={planDays}
          onSelect={(day) =>
            day.date && navigate(`/day?y=${day.date.year}&m=${day.date.month}&d=${day.date.day}`)
          }
        />
        {provisional && (
          <p className="mt-2 text-[10px] text-text-muted">{t("calendar.provisional")}</p>
        )}
      </Card>

      {upNext && (
        <button
          type="button"
          onClick={() => navigate("/events")}
          className="surface-card flex w-full items-center gap-2 px-2.5 py-2 text-left transition-transform active:scale-[0.99]"
        >
          <Icon
            name="festival"
            className="size-3.5 shrink-0 text-[color:var(--color-accent-mark)]"
          />
          <span className="min-w-0 flex-1 truncate text-[12px]">{upNext.name}</span>
          <span className="shrink-0 text-[11px] text-text-muted">
            {relativeText(upNext.days_away, t, numerals)} ›
          </span>
        </button>
      )}
      <GlanceCards />
    </div>
  );
}
