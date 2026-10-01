import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { CONTROL } from "../../../shared/components/control";
import { Icon } from "../../../shared/components/icon";
import { Select } from "../../../shared/components/select";
import { TimeField } from "../../../shared/components/time-field";
import { useSettings } from "../../../shared/context/settings-context";
import {
  api,
  type DayPlan,
  type NepaliDate,
  type PlanRecurrence,
  type PlanTime,
  type QuickKind,
  type QuickPlan,
} from "../../../shared/lib/ipc";
import { LIMITS } from "../../../shared/lib/limits";
import { digits } from "../../../shared/lib/numerals";
import { track } from "../../../shared/lib/usage";
import { WEEKDAYS_NE_LONG } from "./date-summary-panel";

/**
 * A day's plans as a to-do list you type into.
 *
 * One line adds a plan: "Call dai 3pm remind 15m every month". The shell
 * reads the time, reminder and repeat out of it (`sajilo_core::quick_plan`)
 * and they show as chips under the line; small icons beside it set the same
 * things by tapping, for anyone who'd rather. Enter adds and the line stays
 * ready for the next one. Each plan ticks off for this day, and opens in place
 * to change, with no separate form.
 */

const REMINDERS = [
  { id: 0, labelKey: "planner.reminder.at-time" as const },
  { id: 5, labelKey: "planner.reminder.five-minutes" as const },
  { id: 10, labelKey: "planner.reminder.ten-minutes" as const },
  { id: 15, labelKey: "planner.reminder.fifteen-minutes" as const },
  { id: 30, labelKey: "planner.reminder.thirty-minutes" as const },
  { id: 60, labelKey: "planner.reminder.one-hour" as const },
  { id: 120, labelKey: "planner.reminder.two-hours" as const },
  { id: 1440, labelKey: "planner.reminder.one-day" as const },
];
/** The few a tap offers while adding; the rest are in the plan's own editor. */
const QUICK_REMINDERS = [0, 15, 60, 1440];

const REPEATS = [
  { id: "none", labelKey: "planner.repeat.none" as const },
  { id: "monthlyBikramSambat", labelKey: "planner.repeat.monthly" as const },
  { id: "yearlyBikramSambat", labelKey: "planner.repeat.yearly" as const },
] satisfies readonly { id: PlanRecurrence; labelKey: string }[];

/** A pause in typing before the line is read, so each key isn't a call. */
const PARSE_AFTER_MS = 120;

const pad = (value: number) => String(value).padStart(2, "0");
const timeText = (time: PlanTime) => `${pad(time.hour)}:${pad(time.minute)}`;
function timeFrom(text: string): PlanTime {
  const [hour, minute] = text.split(":").map(Number);
  return { hour: hour ?? 9, minute: minute ?? 0 };
}
const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** On the home screen: enough undone plans to glance at; the day has the rest. */
const HOME_ROWS = 3;

const dayLink = (date: NepaliDate) => `/day?y=${date.year}&m=${date.month}&d=${date.day}`;

const sameDay = (a: NepaliDate, b: NepaliDate) =>
  a.year === b.year && a.month === b.month && a.day === b.day;
const isDone = (plan: DayPlan, date: NepaliDate) =>
  (plan.done ?? []).some((day) => sameDay(day, date));

type Menu = "time" | "reminder" | "repeat" | "note" | null;

/** What a tap on an icon set, over what the words say. */
interface Picked {
  time?: string;
  reminder?: number;
  recurrence?: PlanRecurrence;
}

export function DayPlanSection({
  date,
  plans,
  startAdding,
  home,
  onChanged,
}: {
  date: NepaliDate;
  plans: DayPlan[];
  startAdding?: boolean;
  /** Today's plans on the home screen: undone ones only, a few at most. */
  home?: boolean;
  /** Something was added, ticked or removed, on this day or another. */
  onChanged?: () => void;
}) {
  const { t, numerals } = useSettings();
  const navigate = useNavigate();
  const [items, setItems] = useState(plans);
  const [editing, setEditing] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    text: string;
    undo?: DayPlan;
    open?: NepaliDate;
  } | null>(null);

  useEffect(() => setItems(plans), [plans]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const refresh = async () => {
    setItems(await api.plansForDay(date.year, date.month, date.day));
    onChanged?.();
  };

  // Timed first by time, then untimed in the order added, then done ones.
  const sorted = useMemo(() => {
    const rank = (plan: DayPlan) => (isDone(plan, date) ? 2 : plan.time ? 0 : 1);
    return [...items].sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (a.time && b.time ? timeText(a.time).localeCompare(timeText(b.time)) : 0) ||
        a.createdAt.localeCompare(b.createdAt),
    );
  }, [items, date]);
  const doneCount = items.filter((plan) => isDone(plan, date)).length;
  const shown = home ? sorted.filter((plan) => !isDone(plan, date)).slice(0, HOME_ROWS) : sorted;
  const hidden = sorted.length - shown.length;

  const toggle = async (plan: DayPlan) => {
    const next = !isDone(plan, date);
    setItems((current) =>
      current.map((item) =>
        item.id === plan.id
          ? {
              ...item,
              done: next
                ? [...(item.done ?? []), date]
                : (item.done ?? []).filter((day) => !sameDay(day, date)),
            }
          : item,
      ),
    );
    await api.setPlanDone(plan.id, date, next).catch(() => {});
    await refresh();
  };

  const remove = async (plan: DayPlan) => {
    await api.deletePlan(plan.id);
    await refresh();
    setToast({ text: t("planner.deleted").replace("{title}", plan.title), undo: plan });
  };

  const save = async (plan: DayPlan) => {
    await api.savePlan(plan);
    await refresh();
  };

  return (
    <section className={`surface-card relative ${home ? "px-1.5 py-1" : "p-3"}`}>
      {/* Home keeps it to one line: the card is the field, and the
          placeholder says what it's for. */}
      <div className={`mb-2 flex items-baseline justify-between gap-2${home ? " hidden" : ""}`}>
        <p className="text-[11px] font-semibold text-text-secondary">
          {t(home ? "planner.title-today" : "planner.title")}
        </p>
        {items.length > 0 && (
          <p className="text-[10.5px] text-text-muted tabular-nums">
            {t("planner.progress")
              .replace("{done}", digits(doneCount, numerals))
              .replace("{all}", digits(items.length, numerals))}
          </p>
        )}
      </div>

      <QuickAdd
        bare={home}
        placeholder={t(home ? "planner.quick-placeholder-today" : "planner.quick-placeholder")}
        date={date}
        autoFocus={startAdding}
        onAdded={async (on, label) => {
          await refresh();
          // Added to another day: say where it went, since it left this list.
          if (!sameDay(on, date)) {
            setToast({ text: t("planner.added-to").replace("{day}", label), open: on });
          }
        }}
      />

      {shown.length > 0 && (
        <ul className="mt-2">
          {shown.map((plan) => (
            <li key={plan.id}>
              {editing === plan.id ? (
                <PlanEditor
                  plan={plan}
                  onSave={async (next) => {
                    await save(next);
                    setEditing(null);
                  }}
                  onClose={() => setEditing(null)}
                />
              ) : (
                <PlanRow
                  plan={plan}
                  done={isDone(plan, date)}
                  onToggle={() => void toggle(plan)}
                  onEdit={() => setEditing(plan.id)}
                  onDelete={() => void remove(plan)}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {home && hidden > 0 && (
        <button
          type="button"
          onClick={() => navigate(dayLink(date))}
          className="mt-1 px-1 text-[11px] text-text-muted transition-colors hover:text-text"
        >
          {t("planner.see-all").replace("{n}", digits(hidden, numerals))}
        </button>
      )}

      {toast && (
        <div className="day-plan-toast" role="status">
          <span className="min-w-0 flex-1 truncate">{toast.text}</span>
          {toast.undo && (
            <button
              type="button"
              className="font-semibold text-[color:var(--color-accent-mark)]"
              onClick={() => {
                const plan = toast.undo;
                setToast(null);
                if (plan) void save(plan);
              }}
            >
              {t("notes.undo")}
            </button>
          )}
          {toast.open && (
            <button
              type="button"
              className="font-semibold text-[color:var(--color-accent-mark)]"
              onClick={() => toast.open && navigate(dayLink(toast.open))}
            >
              {t("planner.open-day")}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function reminderKey(minutes: number) {
  return REMINDERS.find((item) => item.id === minutes)?.labelKey ?? null;
}

/** The line that adds a plan, its chips, and its optional icons. */
function QuickAdd({
  date,
  bare,
  placeholder,
  autoFocus,
  onAdded,
}: {
  date: NepaliDate;
  /** No box of its own: the card around it is the field. */
  bare?: boolean;
  placeholder: string;
  autoFocus?: boolean;
  onAdded: (on: NepaliDate, label: string) => Promise<void>;
}) {
  const { t, language, numerals } = useSettings();
  const [line, setLine] = useState("");
  const [ignore, setIgnore] = useState<QuickKind[]>([]);
  const [picked, setPicked] = useState<Picked>({});
  const [note, setNote] = useState("");
  const [menu, setMenu] = useState<Menu>(null);
  const [parsed, setParsed] = useState<QuickPlan | null>(null);
  const [dayLabel, setDayLabel] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) input.current?.focus();
  }, [autoFocus]);

  // Read the line as it's typed.
  useEffect(() => {
    if (!line.trim()) {
      setParsed(null);
      return;
    }
    let live = true;
    const timer = window.setTimeout(() => {
      api
        .quickPlan(line, ignore)
        .then((result) => live && setParsed(result))
        .catch(() => {});
    }, PARSE_AFTER_MS);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [line, ignore]);

  // The day the words named, as the calendar writes it: "Fri · Asoj 16".
  const named = parsed?.date ?? null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new parse is a new object for the same day
  useEffect(() => {
    if (!named) return setDayLabel("");
    let live = true;
    api
      .bsToAd(named.year, named.month, named.day)
      .then((day) => {
        if (!live) return;
        const weekday =
          language === "en" ? WEEKDAYS_EN[day.weekday] : WEEKDAYS_NE_LONG[day.weekday];
        const month = language === "en" ? day.englishMonthName : day.nepaliMonthName;
        setDayLabel(`${weekday} · ${month} ${digits(named.day, numerals)}`);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [named?.year, named?.month, named?.day, language, numerals]);

  // What will be saved: the words, with any taps on top.
  const time = picked.time ?? (parsed?.time ? timeText(parsed.time) : null);
  const reminder = picked.reminder ?? parsed?.reminder ?? null;
  const recurrence = picked.recurrence ?? parsed?.recurrence ?? "none";
  const title = (parsed?.title ?? line).trim();
  const typing = line.trim().length > 0;

  const reset = () => {
    setLine("");
    setIgnore([]);
    setPicked({});
    setNote("");
    setMenu(null);
    setParsed(null);
  };

  const dismiss = (kind: QuickKind) => {
    const key = kind === "repeat" ? "recurrence" : kind;
    if (key in picked) {
      const { [key as keyof Picked]: _, ...rest } = picked;
      setPicked(rest);
    } else {
      setIgnore((current) => [...current, kind]);
    }
  };

  const add = async () => {
    if (!title) return;
    track("action.plan-save");
    await api.savePlan({
      id: crypto.randomUUID(),
      date: named ?? date,
      title: title.slice(0, LIMITS.TITLE),
      time: time ? timeFrom(time) : null,
      reminder: time ? reminder : null,
      note: note.trim(),
      recurrence,
      createdAt: new Date().toISOString(),
      done: [],
    });
    const label = dayLabel;
    reset();
    await onAdded(named ?? date, label);
    input.current?.focus();
  };

  const chips: { kind: QuickKind; label: string }[] = [];
  if (named && dayLabel) chips.push({ kind: "day", label: dayLabel });
  if (time) chips.push({ kind: "time", label: time });
  if (time && reminder !== null) {
    const key = reminderKey(reminder);
    if (key) chips.push({ kind: "reminder", label: t(key) });
  }
  if (recurrence !== "none") {
    chips.push({
      kind: "repeat",
      label: t(
        recurrence === "monthlyBikramSambat" ? "planner.repeat.monthly" : "planner.repeat.yearly",
      ),
    });
  }

  const tool = (
    kind: Exclude<Menu, null>,
    icon: "clock" | "bell" | "rotate" | "document",
    label: string,
    on: boolean,
  ) => (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => setMenu((open) => (open === kind ? null : kind))}
      aria-label={label}
      title={label}
      aria-pressed={on}
      className={`day-plan-tool${menu === kind ? " is-open" : ""}`}
    >
      <Icon name={icon} className="size-3.5" />
    </button>
  );

  return (
    <div>
      <div
        className={`day-plan-add field-shell${typing ? " is-typing" : ""}${bare ? " is-bare" : ""}`}
      >
        <Icon name="plus" className="size-3 shrink-0 text-accent-mark" />
        <input
          ref={input}
          value={line}
          maxLength={LIMITS.TITLE * 2}
          onChange={(event) => {
            setLine(event.target.value);
            if (!event.target.value.trim()) reset();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) void add();
            if (event.key === "Escape" && line) {
              event.preventDefault();
              reset();
            }
          }}
          placeholder={placeholder}
          aria-label={t("planner.title-field")}
          className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-text-muted"
        />
        {typing && (
          <span className="flex shrink-0 items-center">
            {tool("time", "clock", t("planner.time"), time !== null)}
            {tool("reminder", "bell", t("planner.reminder"), time !== null && reminder !== null)}
            {tool("repeat", "rotate", t("planner.repeat"), recurrence !== "none")}
            {tool("note", "document", t("planner.note"), note.trim().length > 0)}
          </span>
        )}
      </div>

      {typing && menu === "time" && (
        <div className="day-plan-menu">
          <TimeField
            value={time ?? "09:00"}
            ariaLabel={t("planner.time")}
            onChange={(value) => setPicked((current) => ({ ...current, time: value }))}
          />
        </div>
      )}
      {typing && menu === "reminder" && (
        <div className="day-plan-menu">
          {QUICK_REMINDERS.map((minutes) => {
            const key = reminderKey(minutes);
            return key ? (
              <button
                type="button"
                key={minutes}
                className="day-plan-option"
                aria-pressed={reminder === minutes}
                onClick={() => {
                  setPicked((current) => ({
                    ...current,
                    reminder: minutes,
                    // A reminder needs a time to count back from.
                    time: current.time ?? time ?? "09:00",
                  }));
                  setMenu(null);
                }}
              >
                {t(key)}
              </button>
            ) : null;
          })}
        </div>
      )}
      {typing && menu === "repeat" && (
        <div className="day-plan-menu">
          {REPEATS.map((item) => (
            <button
              type="button"
              key={item.id}
              className="day-plan-option"
              aria-pressed={recurrence === item.id}
              onClick={() => {
                setPicked((current) => ({ ...current, recurrence: item.id }));
                setMenu(null);
              }}
            >
              {t(item.labelKey)}
            </button>
          ))}
        </div>
      )}
      {typing && (menu === "note" || note) && (
        <textarea
          value={note}
          maxLength={LIMITS.NOTE}
          onChange={(event) => setNote(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void add();
            }
          }}
          placeholder={t("planner.note-placeholder")}
          aria-label={t("planner.note")}
          className={`${CONTROL} mt-1.5 min-h-[52px] w-full resize-y py-1.5 text-[12px]`}
        />
      )}

      {typing && chips.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <button
              type="button"
              key={chip.kind}
              onClick={() => dismiss(chip.kind)}
              className="day-plan-chip"
              title={t("planner.chip-remove")}
            >
              {chip.label}
              <span aria-hidden="true">×</span>
            </button>
          ))}
          <span className="ml-auto text-[10px] text-text-muted">{t("planner.enter-to-add")}</span>
        </div>
      )}
    </div>
  );
}

function PlanRow({
  plan,
  done,
  onToggle,
  onEdit,
  onDelete,
}: {
  plan: DayPlan;
  done: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useSettings();
  return (
    <div className={`day-plan-row group${done ? " is-done" : ""}`}>
      <input
        type="checkbox"
        checked={done}
        onChange={onToggle}
        aria-label={plan.title}
        className="day-plan-check"
      />
      <button
        type="button"
        onClick={onEdit}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="day-plan-title block truncate text-[12.5px]">{plan.title}</span>
          {plan.note && (
            <span className="block truncate text-[11px] text-text-muted">{plan.note}</span>
          )}
        </span>
        {plan.recurrence !== "none" && (
          <span className="shrink-0 text-[10.5px] text-text-muted" title={t("planner.repeat")}>
            ↻
          </span>
        )}
        {plan.time && (
          <span className="shrink-0 text-[11.5px] tabular-nums text-text-secondary">
            {timeText(plan.time)}
          </span>
        )}
        {plan.time && plan.reminder !== null && !done && (
          <Icon name="bell" className="size-3 shrink-0 text-accent-mark" />
        )}
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`${t("planner.delete")} ${plan.title}`}
        className="icon-btn shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      >
        <Icon name="close" className="size-3 text-text-muted" />
      </button>
    </div>
  );
}

/** A plan opened in place: its title, and compact controls for the rest. */
function PlanEditor({
  plan,
  onSave,
  onClose,
}: {
  plan: DayPlan;
  onSave: (plan: DayPlan) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useSettings();
  const [draft, setDraft] = useState(plan);
  const save = () => {
    if (!draft.title.trim()) return onClose();
    void onSave({
      ...draft,
      title: draft.title.trim(),
      note: draft.note.trim(),
      reminder: draft.time ? draft.reminder : null,
    });
  };

  return (
    <div className="day-plan-editor space-y-1.5 py-1.5">
      <input
        // biome-ignore lint/a11y/noAutofocus: opened by the user's own click, to type into
        autoFocus
        value={draft.title}
        maxLength={LIMITS.TITLE}
        onChange={(event) => setDraft({ ...draft, title: event.target.value })}
        onKeyDown={(event) => {
          if (event.key === "Enter") save();
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
        aria-label={t("planner.title-field")}
        className={`${CONTROL} w-full`}
      />
      <div className="flex flex-wrap items-center gap-1.5">
        {draft.time ? (
          <>
            <div className="w-[96px]">
              <TimeField
                value={timeText(draft.time)}
                ariaLabel={t("planner.time")}
                onChange={(value) => setDraft({ ...draft, time: timeFrom(value) })}
              />
            </div>
            <button
              type="button"
              className="day-plan-option"
              onClick={() => setDraft({ ...draft, time: null, reminder: null })}
            >
              {t("planner.no-time")}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="day-plan-option"
            onClick={() => setDraft({ ...draft, time: { hour: 9, minute: 0 } })}
          >
            + {t("planner.time")}
          </button>
        )}
      </div>
      {draft.time && (
        <Select
          value={draft.reminder === null ? "" : String(draft.reminder)}
          onChange={(value) =>
            setDraft({ ...draft, reminder: value === "" ? null : Number(value) })
          }
          ariaLabel={t("planner.reminder")}
          options={[
            { id: "", label: t("planner.no-reminder") },
            ...REMINDERS.map((item) => ({ id: String(item.id), label: t(item.labelKey) })),
          ]}
        />
      )}
      <Select
        value={draft.recurrence}
        onChange={(recurrence) => setDraft({ ...draft, recurrence })}
        ariaLabel={t("planner.repeat")}
        options={REPEATS.map((item) => ({ id: item.id, label: t(item.labelKey) }))}
      />
      <textarea
        value={draft.note}
        maxLength={LIMITS.NOTE}
        onChange={(event) => setDraft({ ...draft, note: event.target.value })}
        placeholder={t("planner.note-placeholder")}
        aria-label={t("planner.note")}
        className={`${CONTROL} min-h-[44px] w-full resize-y py-1.5 text-[12px]`}
      />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="btn-ghost text-[11px]">
          {t("action.cancel")}
        </button>
        <button
          type="button"
          onClick={save}
          className="settings-btn settings-btn--accent text-[11px]"
        >
          {t("planner.done-editing")}
        </button>
      </div>
    </div>
  );
}
