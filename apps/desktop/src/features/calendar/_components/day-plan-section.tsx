import { useEffect, useRef, useState } from "react";
import { CONTROL, CONTROL_LABEL } from "../../../shared/components/control";
import { Icon } from "../../../shared/components/icon";
import { Select } from "../../../shared/components/select";
import { Toggle } from "../../../shared/components/toggle";
import { useSettings } from "../../../shared/context/settings-context";
import { api, type DayPlan, type NepaliDate } from "../../../shared/lib/ipc";

const REMINDERS = [
  { id: "", labelKey: "planner.no-reminder" as const },
  { id: "0", labelKey: "planner.reminder.at-time" as const },
  { id: "5", labelKey: "planner.reminder.five-minutes" as const },
  { id: "10", labelKey: "planner.reminder.ten-minutes" as const },
  { id: "15", labelKey: "planner.reminder.fifteen-minutes" as const },
  { id: "30", labelKey: "planner.reminder.thirty-minutes" as const },
  { id: "60", labelKey: "planner.reminder.one-hour" as const },
];

interface PlanDraft {
  id: string;
  title: string;
  note: string;
  hasTime: boolean;
  time: string;
  reminder: string;
  yearly: boolean;
  createdAt: string;
}

function emptyDraft(): PlanDraft {
  return {
    id: crypto.randomUUID(),
    title: "",
    note: "",
    hasTime: false,
    time: "09:00",
    reminder: "",
    yearly: false,
    createdAt: new Date().toISOString(),
  };
}

function draftFromPlan(plan: DayPlan): PlanDraft {
  return {
    id: plan.id,
    title: plan.title,
    note: plan.note,
    hasTime: plan.time !== null,
    time: plan.time
      ? `${String(plan.time.hour).padStart(2, "0")}:${String(plan.time.minute).padStart(2, "0")}`
      : "09:00",
    reminder: plan.reminder !== null ? String(plan.reminder) : "",
    yearly: plan.recurrence === "yearlyBikramSambat",
    createdAt: plan.createdAt,
  };
}

function timeLabel(time: DayPlan["time"]): string | null {
  if (!time) return null;
  return `${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}`;
}

function PlanEditor({
  draft,
  onChange,
  onCancel,
  onSave,
}: {
  draft: PlanDraft;
  onChange: (draft: PlanDraft) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const { t } = useSettings();
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleInputRef.current?.focus();
  }, []);

  return (
    <div className="day-plan-editor space-y-2">
      <input
        ref={titleInputRef}
        value={draft.title}
        onChange={(e) => onChange({ ...draft, title: e.target.value })}
        placeholder={t("planner.title-field")}
        className={`${CONTROL} w-full`}
      />

      <Toggle
        label={t("planner.include-time")}
        checked={draft.hasTime}
        onChange={(hasTime) => onChange({ ...draft, hasTime })}
      />

      <Toggle
        label={t("planner.repeats-yearly")}
        checked={draft.yearly}
        onChange={(yearly) => onChange({ ...draft, yearly })}
      />

      {draft.hasTime && (
        <div className="grid grid-cols-2 gap-2">
          <label className="block min-w-0">
            <span className={CONTROL_LABEL}>{t("planner.time")}</span>
            <input
              type="time"
              value={draft.time}
              onChange={(e) => onChange({ ...draft, time: e.target.value })}
              className={CONTROL}
            />
          </label>
          <Select
            label={t("planner.reminder")}
            value={draft.reminder}
            onChange={(reminder) => onChange({ ...draft, reminder })}
            options={REMINDERS.map((item) => ({ id: item.id, label: t(item.labelKey) }))}
          />
        </div>
      )}

      <input
        value={draft.note}
        onChange={(e) => onChange({ ...draft, note: e.target.value })}
        placeholder={t("planner.note-field")}
        className={`${CONTROL} w-full`}
      />

      <div className="flex items-center justify-between gap-2 pt-0.5">
        <button type="button" onClick={onCancel} className="btn-ghost text-[11px]">
          {t("action.cancel")}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!draft.title.trim()}
          className="settings-btn text-[11px] disabled:opacity-40"
        >
          {t("planner.save")}
        </button>
      </div>
    </div>
  );
}

function PlanRow({
  plan,
  onEdit,
  onDelete,
}: {
  plan: DayPlan;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useSettings();
  const time = timeLabel(plan.time);

  return (
    <div className="group flex items-start gap-1.5 py-1.5">
      <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left">
        <p className="truncate text-[12px]">
          {time && (
            <span className="mr-1.5 font-semibold tabular-nums text-accent-mark">{time}</span>
          )}
          <span className="font-medium">{plan.title}</span>
        </p>
        {plan.note && (
          <p className="mt-0.5 line-clamp-2 text-[11px] text-text-muted">{plan.note}</p>
        )}
        {plan.recurrence === "yearlyBikramSambat" && (
          <p className="mt-0.5 text-[10px] text-text-muted">{t("planner.repeats-yearly")}</p>
        )}
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`${t("planner.delete")} ${plan.title}`}
        className="icon-btn shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
      >
        <Icon name="trash" className="size-3 text-text-muted hover:text-holiday" />
      </button>
    </div>
  );
}

export function DayPlanSection({
  date,
  plans,
  startAdding,
}: {
  date: NepaliDate;
  plans: DayPlan[];
  startAdding?: boolean;
}) {
  const { t } = useSettings();
  const [draft, setDraft] = useState<PlanDraft | null>(null);
  const [items, setItems] = useState(plans);

  useEffect(() => setItems(plans), [plans]);

  useEffect(() => {
    if (startAdding && !draft) setDraft(emptyDraft());
  }, [startAdding, draft]);

  const refresh = async () => {
    setItems(await api.plansForDay(date.year, date.month, date.day));
  };

  const saveDraft = async () => {
    if (!draft?.title.trim()) return;
    const [hour, minute] = draft.time.split(":").map(Number);
    await api.savePlan({
      id: draft.id,
      date,
      title: draft.title.trim(),
      time: draft.hasTime ? { hour: hour ?? 9, minute: minute ?? 0 } : null,
      reminder: draft.hasTime && draft.reminder !== "" ? Number(draft.reminder) : null,
      note: draft.note.trim(),
      recurrence: draft.yearly ? "yearlyBikramSambat" : "none",
      createdAt: draft.createdAt,
    });
    setDraft(null);
    await refresh();
  };

  const removePlan = async (id: string) => {
    await api.deletePlan(id);
    await refresh();
  };

  return (
    <section className="surface-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
          {t("planner.title")}
        </p>
        {!draft && (
          <button
            type="button"
            onClick={() => setDraft(emptyDraft())}
            className="btn-ghost flex items-center gap-1 text-[11px]"
          >
            <Icon name="plus" className="size-3" />
            {t("planner.add")}
          </button>
        )}
      </div>

      {items.length === 0 && !draft && (
        <p className="text-[12px] text-text-secondary">{t("planner.empty")}</p>
      )}

      {items.length > 0 && (
        <ul className="divide-y divide-divider">
          {items.map((plan) => (
            <li key={plan.id}>
              <PlanRow
                plan={plan}
                onEdit={() => setDraft(draftFromPlan(plan))}
                onDelete={() => removePlan(plan.id)}
              />
            </li>
          ))}
        </ul>
      )}

      {draft && (
        <div className={items.length > 0 ? "mt-2 border-t border-divider pt-2" : ""}>
          <PlanEditor
            draft={draft}
            onChange={setDraft}
            onCancel={() => setDraft(null)}
            onSave={saveDraft}
          />
        </div>
      )}
    </section>
  );
}
