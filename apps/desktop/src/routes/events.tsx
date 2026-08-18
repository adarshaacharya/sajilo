import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Card } from "../components/Card";
import { Segmented } from "../components/Segmented";
import { api, type UpcomingEvent } from "../lib/ipc";
import { digits } from "../lib/numerals";
import { useSettings } from "../lib/settings";

type Filter = "current" | "festivals" | "publicHolidays";

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
  const [filter, setFilter] = useState<Filter>("festivals");

  useEffect(() => {
    // The horizon and limit are the engine's defaults; a longer list would be
    // scrolling for its own sake.
    api
      .upcomingEvents(100, 400)
      .then(setEvents)
      .catch(() => setEvents([]));
  }, []);

  const shown = events.filter((event) => includes(filter, event));
  const filters = [
    { id: "current" as const, label: t("events.current"), icon: "upcoming" as const },
    { id: "festivals" as const, label: t("events.festivals"), icon: "festival" as const },
    { id: "publicHolidays" as const, label: t("events.public-holidays"), icon: "holiday" as const },
  ];

  return (
    <div className="space-y-3">
      <Segmented label={t("events.filter")} value={filter} onChange={setFilter} options={filters} />

      <Card>
        {shown.length === 0 ? (
          <p className="text-text-muted">{t("upcoming.empty")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {shown.map((event) => (
              <li key={`${event.date.year}-${event.date.month}-${event.date.day}-${event.name}`}>
                <button
                  type="button"
                  onClick={() =>
                    navigate(`/day?y=${event.date.year}&m=${event.date.month}&d=${event.date.day}`)
                  }
                  className="w-full py-2 text-left"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={`truncate ${event.is_public_holiday ? "text-holiday" : ""}`}>
                      {event.name}
                    </span>
                    <span className="shrink-0 text-[11px] text-text-muted">
                      {event.days_away === 0
                        ? t("relative.today")
                        : event.days_away === 1
                          ? t("relative.tomorrow")
                          : t("relative.in-days").replace("{n}", digits(event.days_away, numerals))}
                    </span>
                  </div>
                  <p className="text-[11px] text-text-muted">
                    {digits(event.date.day, numerals)}/{digits(event.date.month, numerals)}/
                    {digits(event.date.year, numerals)} · {event.gregorian}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
