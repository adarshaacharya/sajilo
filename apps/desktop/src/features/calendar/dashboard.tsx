import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Card } from "../../shared/components/card";
import { MonthGrid } from "../../shared/components/month-grid";
import { SkeletonBlock } from "../../shared/components/skeleton";
import { StateBanner } from "../../shared/components/state-banner";
import { TrayPinTip, useTrayPinTip } from "../../shared/components/tray-pin-tip";
import { useSettings } from "../../shared/context/settings-context";
import {
  api,
  type CalendarMonth,
  type NepaliDate,
  type Today,
  type UpcomingEvent,
} from "../../shared/lib/ipc";
import { digits } from "../../shared/lib/numerals";
import { ClockRow } from "./_components/clock-row";
import { DateHeader } from "./_components/date-header";
import { FocusGlance } from "./_components/focus-glance";
import { GlanceCards } from "./_components/glance-cards";
import { HomeAnnouncement } from "./_components/home-announcement";
import { RashifalGlance } from "./_components/rashifal-glance";
import { SetupCard, useSetupCard } from "./_components/setup-card";
import { UpNext } from "./_components/up-next";

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

/**
 * The month the grid is showing, read from the dashboard's own history entry.
 *
 * It lives in the URL rather than component state because opening a day
 * unmounts this screen: state would be lost and Back would land on the current
 * month again — painful when stepping through every day of Dashain. `null`
 * means "the current month", which is also what the Today tab navigates to.
 */
function viewedMonth(params: URLSearchParams): { year: number; month: number } | null {
  const year = Number(params.get("y"));
  const month = Number(params.get("m"));
  return Number.isInteger(year) && year > 0 && Number.isInteger(month) && month > 0
    ? { year, month }
    : null;
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
  const [params, setParams] = useSearchParams();
  const trayPin = useTrayPinTip();
  const setup = useSetupCard();

  const [today, setToday] = useState<Today | null>(null);
  const [month, setMonth] = useState<CalendarMonth | null>(null);
  const [monthSpan, setMonthSpan] = useState("");
  const [upcoming, setUpcoming] = useState<UpcomingEvent[]>([]);
  const [planDays, setPlanDays] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setError(null);
    api
      .today()
      .then(setToday)
      .catch((cause) => setError(String(cause)));
    // Enough of the season to find the next public holiday for Up next, not
    // just the next observance, which is usually a tithi a day or two away.
    api
      .upcomingEvents(40, 180)
      .then(setUpcoming)
      .catch(() => setUpcoming([]));
  }, []);

  useEffect(reload, [reload]);

  const viewed = viewedMonth(params);
  const cursorYear = viewed?.year ?? today?.nepali.year;
  const cursorMonth = viewed?.month ?? today?.nepali.month;

  // Asked per month rather than derived from every plan here: a monthly or
  // yearly plan lands on a different day each time, and that is the engine's
  // call, not the grid's.
  useEffect(() => {
    if (!cursorYear || !cursorMonth) return;
    api
      .planDays(cursorYear, cursorMonth)
      .then((days) =>
        setPlanDays(new Set((days ?? []).map((day) => `${cursorYear}-${cursorMonth}-${day}`))),
      )
      .catch(() => setPlanDays(new Set()));
  }, [cursorYear, cursorMonth]);

  useEffect(() => {
    if (!cursorYear || !cursorMonth) return;
    api
      .monthGrid(cursorYear, cursorMonth)
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
  }, [cursorYear, cursorMonth]);

  // `replace`, so paging months never piles up entries that Back would replay.
  const step = (offset: number) => {
    if (!cursorYear || !cursorMonth) return;
    api
      .shiftMonth(cursorYear, cursorMonth, offset)
      .then((next: NepaliDate) =>
        setParams({ y: String(next.year), m: String(next.month) }, { replace: true }),
      )
      .catch(() => {});
  };

  if (error) {
    return <StateBanner state={{ status: "failed", message: error }} onRetry={reload} />;
  }
  if (!today || !month) return <DashboardSkeleton />;

  const provisional = cursorYear !== undefined && PROVISIONAL_YEARS.has(cursorYear);
  const upNext = upcoming[0];
  const nextHoliday = upcoming.find((event) => event.is_public_holiday);
  const eventSlides = [
    upNext,
    nextHoliday && nextHoliday.name !== upNext?.name ? nextHoliday : null,
  ]
    .filter((event): event is NonNullable<typeof event> => event != null)
    .map((event) => ({
      name: event.name,
      when: relativeText(event.days_away, t, numerals),
      holiday: event.is_public_holiday,
      date: event.date,
    }));

  return (
    <div className="space-y-2.5">
      {/* Above the date, once: a Windows user who cannot find the tray icon
          will not come back to read it anywhere lower. */}
      {/* One first-run card at a time: setup first, then where the tray icon is. */}
      {trayPin.visible && !setup.visible && <TrayPinTip onDismiss={trayPin.dismiss} />}
      <DateHeader today={today} />
      {setup.visible && <SetupCard onDone={setup.dismiss} />}

      <HomeAnnouncement />

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
            {month.monthName} {digits(month.firstDate.year, numerals)}
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

      <UpNext events={eventSlides} />
      <FocusGlance />
      <GlanceCards />
      <RashifalGlance />
    </div>
  );
}
