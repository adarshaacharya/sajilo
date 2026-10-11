import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Card } from "../../shared/components/card";
import { Segmented } from "../../shared/components/segmented";
import { useSettings } from "../../shared/context/settings-context";
import { api, type NepaliDate, type UpcomingEvent, type UpcomingPlan } from "../../shared/lib/ipc";
import { digits } from "../../shared/lib/numerals";

type Filter = "current" | "festivals" | "publicHolidays" | "plans";

/** Mirrors `UpcomingEventFilter` in `sajilo-core`. */
function includes(filter: Filter, event: UpcomingEvent): boolean {
  switch (filter) {
    // Today plus the next six days keeps this a useful near-term view.
    case "current":
      return event.days_away < 7;
    case "publicHolidays":
      return event.is_public_holiday;
    // Every item already has a named cultural, religious or civic event.
    default:
      return true;
  }
}

export function Events() {
  const { numerals, t } = useSettings();
  const navigate = useNavigate();
  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [plans, setPlans] = useState<UpcomingPlan[] | null>(null);
  const [filter, setFilter] = useState<Filter>("festivals");

  useEffect(() => {
    // The horizon and limit are the engine's defaults; a longer list would be
    // scrolling for its own sake.
    api
      .upcomingEvents(100, 400)
      .then(setEvents)
      .catch(() => setEvents([]));
  }, []);

  useEffect(() => {
    if (filter !== "plans") return;
    api
      .upcomingPlans()
      .then(setPlans)
      .catch(() => setPlans([]));
  }, [filter]);

  const when = (daysAway: number) =>
    daysAway === 0
      ? t("relative.today")
      : daysAway === 1
        ? t("relative.tomorrow")
        : daysAway === -1
          ? t("relative.yesterday")
          : daysAway < 0
            ? t("relative.days-ago").replace("{n}", digits(-daysAway, numerals))
            : t("relative.in-days").replace("{n}", digits(daysAway, numerals));
  const openDay = (date: NepaliDate) =>
    navigate(`/day?y=${date.year}&m=${date.month}&d=${date.day}`);
  const dateLine = (date: NepaliDate, gregorian: string) =>
    `${digits(date.day, numerals)}/${digits(date.month, numerals)}/${digits(date.year, numerals)} · ${gregorian}`;

  const shown = events.filter((event) => includes(filter, event));
  const filters = [
    { id: "current" as const, label: t("events.current"), icon: "upcoming" as const },
    { id: "festivals" as const, label: t("events.festivals"), icon: "festival" as const },
    { id: "publicHolidays" as const, label: t("events.public-holidays"), icon: "holiday" as const },
    { id: "plans" as const, label: t("events.my-plans"), icon: "calendar" as const },
  ];

  return (
    <div className="space-y-3">
      <Segmented label={t("events.filter")} value={filter} onChange={setFilter} options={filters} />

      {filter === "plans" && plans == null ? null : (
        <Card>
          {filter === "plans" ? (
            !plans?.length ? (
              <p className="text-text-muted">{t("events.no-plans")}</p>
            ) : (
              <ul className="list-rows">
                {plans.map(({ plan, date, gregorian, days_away }) => (
                  <li key={`${plan.id}-${date.year}-${date.month}-${date.day}`}>
                    <button
                      type="button"
                      onClick={() => openDay(date)}
                      className="w-full py-2 text-left"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate">
                          {plan.title}
                          {plan.recurrence !== "none" && (
                            <span
                              className="ml-1 text-[10.5px] text-text-muted"
                              title={t("planner.repeat")}
                            >
                              ↻
                            </span>
                          )}
                        </span>
                        <span
                          className={`shrink-0 text-[11px] ${days_away < 0 ? "text-negative" : "text-text-muted"}`}
                        >
                          {when(days_away)}
                        </span>
                      </div>
                      <p className="text-[11px] text-text-muted">
                        {dateLine(date, gregorian)}
                        {plan.time &&
                          ` · ${`${digits(plan.time.hour, numerals, 2)}:${digits(plan.time.minute, numerals, 2)}`}`}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : shown.length === 0 ? (
            <p className="text-text-muted">{t("upcoming.empty")}</p>
          ) : (
            <ul className="list-rows">
              {shown.map((event) => (
                <li key={`${event.date.year}-${event.date.month}-${event.date.day}-${event.name}`}>
                  <button
                    type="button"
                    onClick={() => openDay(event.date)}
                    className="w-full py-2 text-left"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={`truncate ${event.is_public_holiday ? "text-holiday" : ""}`}>
                        {event.name}
                      </span>
                      <span className="shrink-0 text-[11px] text-text-muted">
                        {when(event.days_away)}
                      </span>
                    </div>
                    <p className="text-[11px] text-text-muted">
                      {dateLine(event.date, event.gregorian)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
