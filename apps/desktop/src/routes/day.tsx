import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { Card } from "../components/Card";
import { CONTROL } from "../components/control";
import { Select } from "../components/Select";
import { Toggle } from "../components/Toggle";
import { ResultCard } from "../components/tools/ResultCard";
import { api, type CalendarEvent, type Conversion, type DayPlan, type Panchanga } from "../lib/ipc";
import { digits } from "../lib/numerals";
import { useSettings } from "../lib/settings";

function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function daylightText(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

const REMINDERS = [
  { id: "", labelKey: "planner.no-reminder" as const },
  { id: "0", labelKey: "planner.reminder.at-time" as const },
  { id: "5", labelKey: "planner.reminder.five-minutes" as const },
  { id: "10", labelKey: "planner.reminder.ten-minutes" as const },
  { id: "15", labelKey: "planner.reminder.fifteen-minutes" as const },
  { id: "30", labelKey: "planner.reminder.thirty-minutes" as const },
  { id: "60", labelKey: "planner.reminder.one-hour" as const },
];

export function DayDetail() {
  const { numerals, t } = useSettings();
  const [params] = useSearchParams();
  const [date, setDate] = useState<{ year: number; month: number; day: number } | null>(null);
  const [conversion, setConversion] = useState<Conversion | null>(null);
  const [event, setEvent] = useState<CalendarEvent | null>(null);
  const [panchanga, setPanchanga] = useState<Panchanga | null>(null);
  const [plans, setPlans] = useState<DayPlan[]>([]);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");
  const [hasTime, setHasTime] = useState(false);
  const [time, setTime] = useState("09:00");
  const [reminder, setReminder] = useState("");
  const [yearly, setYearly] = useState(false);

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

  const addPlan = async () => {
    const title = draft.trim();
    if (!date || !title) return;
    const [hour, minute] = time.split(":").map(Number);
    await api.savePlan({
      id: crypto.randomUUID(),
      date,
      title,
      time: hasTime ? { hour: hour ?? 9, minute: minute ?? 0 } : null,
      reminder: hasTime && reminder !== "" ? Number(reminder) : null,
      note: note.trim(),
      recurrence: yearly ? "yearlyBikramSambat" : "none",
      createdAt: new Date().toISOString(),
    });
    setDraft("");
    setNote("");
    setHasTime(false);
    setReminder("");
    setYearly(false);
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

      <div className="space-y-1.5">
        <p className="px-0.5 text-[10px] font-semibold text-text-muted">{t("action.copy-as")}</p>
        <div className="grid grid-cols-3 gap-1.5">
          <ResultCard
            title="Nepali numerals"
            value={`${digits(date.year, numerals)}/${digits(date.month, numerals)}/${digits(date.day, numerals)}`}
          />
          <ResultCard
            title="English numerals"
            value={`${date.year}/${String(date.month).padStart(2, "0")}/${String(date.day).padStart(2, "0")}`}
          />
          <ResultCard title="ISO" value={conversion.gregorian} />
        </div>
      </div>

      {panchanga && (
        <Card title={t("panchanga.title")}>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[10px] text-text-muted">{t("panchanga.sunrise")}</p>
              <p className="tabular-nums font-medium">{clockTime(panchanga.sunrise)}</p>
            </div>
            <div>
              <p className="text-[10px] text-text-muted">{t("panchanga.sunset")}</p>
              <p className="tabular-nums font-medium">{clockTime(panchanga.sunset)}</p>
            </div>
            <div>
              <p className="text-[10px] text-text-muted">{t("panchanga.daylight")}</p>
              <p className="tabular-nums font-medium">{daylightText(panchanga.daylightSeconds)}</p>
            </div>
          </div>
          {panchanga.rahuKaalStart && panchanga.rahuKaalEnd && (
            <div className="mt-2 border-t border-border pt-2">
              <p className="text-[11px] font-medium text-holiday">
                {t("panchanga.rahu-kaal")} {clockTime(panchanga.rahuKaalStart)}–
                {clockTime(panchanga.rahuKaalEnd)}
              </p>
              <p className="mt-0.5 text-[10px] text-text-muted">{t("panchanga.rahu-note")}</p>
            </div>
          )}
          <p className="mt-2 text-[10px] text-text-muted">{t("panchanga.computed")}</p>
        </Card>
      )}

      <Card title={t("planner.title")}>
        <div className="space-y-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addPlan()}
            placeholder={t("planner.title-field")}
            className={`${CONTROL} w-full`}
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("planner.note-field")}
            className={`${CONTROL} w-full`}
          />
          <Toggle label={t("planner.include-time")} checked={hasTime} onChange={setHasTime} />
          {hasTime && (
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-[10px] text-text-muted">
                  {t("planner.reminder")}
                </span>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className={CONTROL}
                />
              </label>
              <Select
                label={t("planner.reminder")}
                value={reminder}
                onChange={setReminder}
                options={REMINDERS.map((item) => ({
                  id: item.id,
                  label: t(item.labelKey),
                }))}
              />
            </div>
          )}
          <Toggle label={t("planner.repeats-yearly")} checked={yearly} onChange={setYearly} />
          <button
            type="button"
            onClick={addPlan}
            disabled={!draft.trim()}
            className={`${CONTROL} w-full text-text-secondary hover:bg-surface-hover hover:text-text disabled:opacity-40`}
          >
            {t("planner.add")}
          </button>
        </div>

        {plans.length === 0 ? (
          <p className="mt-2 text-text-muted">{t("planner.empty")}</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {plans.map((plan) => (
              <li key={plan.id} className="group flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate">
                    {plan.time && (
                      <span className="mr-1.5 font-medium text-accent">
                        {String(plan.time.hour).padStart(2, "0")}:
                        {String(plan.time.minute).padStart(2, "0")}
                      </span>
                    )}
                    {plan.title}
                  </p>
                  {plan.note && <p className="text-[11px] text-text-muted">{plan.note}</p>}
                </div>
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
