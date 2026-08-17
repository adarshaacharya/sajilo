import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Card } from "../../components/Card";
import {
  api,
  type CalendarMonth,
  type NepaliDate,
  type Today,
  type UpcomingEvent,
} from "../../lib/ipc";
import { digits } from "../../lib/numerals";
import { useSettings } from "../../lib/settings";
import { MonthGrid } from "./MonthGrid";

/** "Today" / "Tomorrow" / "in N days", with the count in the chosen digits. */
function relativeText(
  daysAway: number,
  t: (key: "relative.today" | "relative.tomorrow" | "relative.in-days") => string,
  numerals: Parameters<typeof digits>[1],
): string {
  if (daysAway === 0) return t("relative.today");
  if (daysAway === 1) return t("relative.tomorrow");
  return t("relative.in-days").replace("{n}", digits(daysAway, numerals));
}

export function Dashboard() {
  const { numerals, t } = useSettings();
  const navigate = useNavigate();

  const [today, setToday] = useState<Today | null>(null);
  const [cursor, setCursor] = useState<NepaliDate | null>(null);
  const [month, setMonth] = useState<CalendarMonth | null>(null);
  const [upcoming, setUpcoming] = useState<UpcomingEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .today()
      .then((value) => {
        setToday(value);
        setCursor(value.nepali);
      })
      .catch((cause) => setError(String(cause)));
    api
      .upcomingEvents(5)
      .then(setUpcoming)
      .catch(() => setUpcoming([]));
  }, []);

  useEffect(() => {
    if (!cursor) return;
    api
      .monthGrid(cursor.year, cursor.month)
      .then(setMonth)
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

  return (
    <div className="space-y-3">
      <Card>
        <div className="flex items-baseline justify-between">
          <div>
            <p className="text-xl font-semibold leading-tight">
              {today.nepaliMonthName} {digits(today.nepali.day, numerals)}
            </p>
            <p className="text-text-secondary">{digits(today.nepali.year, numerals)}</p>
          </div>
          <p className="text-right text-text-muted">{today.gregorian}</p>
        </div>
      </Card>

      <Card>
        <div className="mb-2 flex items-center justify-between">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => step(-1)}
            className="rounded px-2 text-text-secondary hover:bg-surface-hover"
          >
            ‹
          </button>
          <span className="text-[12px] font-medium">{month.title}</span>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => step(1)}
            className="rounded px-2 text-text-secondary hover:bg-surface-hover"
          >
            ›
          </button>
        </div>
        <MonthGrid
          month={month}
          onSelect={(day) =>
            day.date && navigate(`/day?y=${day.date.year}&m=${day.date.month}&d=${day.date.day}`)
          }
        />
      </Card>

      <Card title={t("planner.up-next")}>
        {upcoming.length === 0 ? (
          <p className="text-text-muted">{t("upcoming.empty")}</p>
        ) : (
          <ul className="space-y-1.5">
            {upcoming.map((event) => (
              <li key={`${event.date.year}-${event.date.month}-${event.date.day}-${event.name}`}>
                <button
                  type="button"
                  onClick={() =>
                    navigate(`/day?y=${event.date.year}&m=${event.date.month}&d=${event.date.day}`)
                  }
                  className="flex w-full items-baseline justify-between gap-2 text-left"
                >
                  <span
                    className={`truncate ${event.is_public_holiday ? "text-holiday" : "text-text"}`}
                  >
                    {event.name}
                  </span>
                  <span className="shrink-0 text-[11px] text-text-muted">
                    {relativeText(event.days_away, t, numerals)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
