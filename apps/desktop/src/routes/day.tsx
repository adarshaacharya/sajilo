import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { Card } from "../components/Card";
import { CONTROL } from "../components/control";
import { api, type CalendarEvent, type Conversion, type DayPlan } from "../lib/ipc";
import { digits } from "../lib/numerals";
import { useSettings } from "../lib/settings";

export function DayDetail() {
  const { numerals, t } = useSettings();
  const [params] = useSearchParams();
  const [date, setDate] = useState<{ year: number; month: number; day: number } | null>(null);
  const [conversion, setConversion] = useState<Conversion | null>(null);
  const [event, setEvent] = useState<CalendarEvent | null>(null);
  const [plans, setPlans] = useState<DayPlan[]>([]);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    const year = Number(params.get("y"));
    const month = Number(params.get("m"));
    const day = Number(params.get("d"));
    if (year && month && day) {
      setDate({ year, month, day });
    } else {
      // Opened from the tab bar rather than a grid cell.
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
      .catch(() => {});
    api
      .eventsFor(date.year, date.month, date.day)
      .then(setEvent)
      .catch(() => setEvent(null));
    api
      .plansForDay(date.year, date.month, date.day)
      .then(setPlans)
      .catch(() => setPlans([]));
  }, [date]);

  const addPlan = async () => {
    const title = draft.trim();
    if (!date || !title) return;
    await api.savePlan({
      id: crypto.randomUUID(),
      date,
      title,
      time: null,
      reminder: null,
      note: "",
      recurrence: "none",
      createdAt: new Date().toISOString(),
    });
    setDraft("");
    setPlans(await api.plansForDay(date.year, date.month, date.day));
  };

  const removePlan = async (id: string) => {
    if (!date) return;
    await api.deletePlan(id);
    setPlans(await api.plansForDay(date.year, date.month, date.day));
  };

  if (!date || !conversion) return <p className="text-text-muted">…</p>;

  return (
    <div className="space-y-3">
      <Card>
        <p className="text-lg font-semibold">
          {conversion.nepaliMonthName} {digits(date.day, numerals)}, {digits(date.year, numerals)}
        </p>
        <p className="text-text-muted">{conversion.gregorian}</p>
      </Card>

      <Card title={t("calendar.festival-tithi")}>
        {event?.name || event?.tithi ? (
          <>
            {event.name && (
              <p className={event.is_public_holiday ? "text-holiday" : ""}>{event.name}</p>
            )}
            {event.tithi && <p className="mt-1 text-text-secondary">{event.tithi}</p>}
          </>
        ) : (
          <p className="text-text-muted">{t("calendar.no-event")}</p>
        )}
      </Card>

      <Card title={t("planner.title")}>
        <div className="flex gap-1.5">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addPlan()}
            placeholder={t("planner.title-field")}
            className={`${CONTROL} min-w-0 flex-1`}
          />
          <button
            type="button"
            onClick={addPlan}
            disabled={!draft.trim()}
            className={`${CONTROL} shrink-0 px-2.5 text-text-secondary hover:bg-surface-hover hover:text-text disabled:opacity-40`}
          >
            +
          </button>
        </div>

        {plans.length === 0 ? (
          <p className="mt-2 text-text-muted">{t("planner.empty")}</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {plans.map((plan) => (
              <li key={plan.id} className="group flex items-center justify-between gap-2">
                <span className="truncate">{plan.title}</span>
                <button
                  type="button"
                  onClick={() => removePlan(plan.id)}
                  aria-label={`${t("planner.delete")} ${plan.title}`}
                  className="shrink-0 rounded px-1.5 text-text-muted opacity-0 transition-opacity hover:text-holiday group-hover:opacity-100"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
