import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Card } from "../components/Card";
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
  const filters: { id: Filter; label: string }[] = [
    { id: "current", label: t("events.current") },
    { id: "festivals", label: t("events.festivals") },
    { id: "publicHolidays", label: t("events.public-holidays") },
  ];

  return (
    <div className="space-y-3">
      <div role="tablist" aria-label={t("events.filter")} className="flex gap-1">
        {filters.map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={filter === option.id}
            onClick={() => setFilter(option.id)}
            className={`flex-1 rounded-md border px-2 py-1 text-[11px] transition-colors ${
              filter === option.id
                ? "border-accent bg-accent/10 text-accent"
                : "border-border text-text-secondary hover:bg-surface-hover"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

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
