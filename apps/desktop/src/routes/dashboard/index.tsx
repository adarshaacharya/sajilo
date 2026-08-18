import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Card } from "../../components/Card";
import { ICONS, Icon } from "../../components/Icon";
import {
  api,
  type CalendarMonth,
  type DayPlan,
  type NepaliDate,
  type Today,
  type UpcomingEvent,
} from "../../lib/ipc";
import { digits } from "../../lib/numerals";
import { useSettings } from "../../lib/settings";
import { DateHeader } from "./DateHeader";
import { GlanceCards } from "./GlanceCards";
import { MonthGrid } from "./MonthGrid";

const PROVISIONAL_YEARS = new Set([2085, 2086, 2087, 2088, 2089, 2090]);
const GREG_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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

/** "Aug/Sep 2026" from the BS month's first and last Gregorian dates. */
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
  const { numerals, t } = useSettings();
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

  useEffect(() => {
    api
      .today()
      .then((value) => {
        setToday(value);
        setCursor(value.nepali);
      })
      .catch((cause) => setError(String(cause)));
    // One headline for the banner — full list lives on Events.
    api
      .upcomingEvents(1)
      .then(setUpcoming)
      .catch(() => setUpcoming([]));
    api
      .listPlans()
      .then(setPlans)
      .catch(() => setPlans([]));
  }, []);

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
    return (
      <Card title={t("state.unavailable")}>
        <p className="text-text-secondary">{error}</p>
      </Card>
    );
  }
  if (!today || !month) {
    return <p className="text-text-muted">…</p>;
  }

  const provisional = cursor && PROVISIONAL_YEARS.has(cursor.year);
  const upNext = upcoming[0];

  return (
    <div className="space-y-2.5">
      <DateHeader today={today} />

      <Card>
        <div className="mb-2 flex items-center justify-between">
          <button
            type="button"
            aria-label={t("calendar.previous-month")}
            onClick={() => step(-1)}
            className="rounded px-2 py-0.5 text-text-secondary hover:bg-surface-hover"
          >
            ‹
          </button>
          <span className="text-[12px] font-medium">
            {month.title}
            {monthSpan ? ` · ${monthSpan}` : ""}
          </span>
          <button
            type="button"
            aria-label={t("calendar.next-month")}
            onClick={() => step(1)}
            className="rounded px-2 py-0.5 text-text-secondary hover:bg-surface-hover"
          >
            ›
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
          className="surface-card flex w-full items-center gap-2 px-2.5 py-2 text-left hover:bg-surface-hover"
        >
          <Icon
            path={ICONS.festival}
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
