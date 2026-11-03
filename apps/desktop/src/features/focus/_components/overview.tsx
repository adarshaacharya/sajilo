import { type ReactNode, useEffect, useRef, useState } from "react";
import { Icon } from "../../../shared/components/icon";
import { Segmented } from "../../../shared/components/segmented";
import { useSettings } from "../../../shared/context/settings-context";
import type { BreakKind, FocusSettings, FocusSnapshot, PauseChoice } from "../../../shared/lib/ipc";
import { digits } from "../../../shared/lib/numerals";
import {
  clock,
  duration,
  HOLD_ICONS,
  HOLD_LABELS,
  type I18nKey,
  KIND_TINTS,
  kindLabel,
  litres,
  upcoming,
  useSentenceNumerals,
} from "../_lib/format";
import { ReminderList } from "./reminder-list";
import { Chip, Ring } from "./ring";
import { WeekCard } from "./week-card";

const PAUSES = [
  { choice: "halfHour", label: "focus.pause-half-hour" },
  { choice: "hour", label: "focus.pause-hour" },
  { choice: "restOfDay", label: "focus.pause-rest-of-day" },
  { choice: "untilResumed", label: "focus.pause-until-resumed" },
] as const satisfies readonly { choice: PauseChoice; label: I18nKey }[];

function time(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/**
 * The tab once reminders are on: what's next in one line, today in three
 * numbers, the water glass, every reminder as a row you can open, and the
 * week. Every number is the engine's; this only draws them.
 */
export function Overview({
  snapshot,
  onSettings,
  onWater,
  onPause,
  onUnmute,
  onExample,
  onCustomise,
}: {
  snapshot: FocusSnapshot;
  onSettings: (settings: FocusSettings) => void;
  onWater: (steps: 1 | -1) => void;
  onPause: (choice: PauseChoice) => void;
  /** Turns every notification back on, in Settings › Notifications. */
  onUnmute: () => void;
  onExample: (kind: BreakKind) => void;
  onCustomise: () => void;
}) {
  return (
    <div className="space-y-2.5">
      <StatusCard snapshot={snapshot} onPause={onPause} onUnmute={onUnmute} onWater={onWater} />
      <ReminderList
        snapshot={snapshot}
        onSettings={onSettings}
        onExample={onExample}
        onCustomise={onCustomise}
      />
      <DayCard snapshot={snapshot} />
    </div>
  );
}

/**
 * What's next, in one card: a small ring and the break's name while one
 * counts down, or a single line saying why nothing does — paused, a call, a
 * day off. Only a break that is due, or reminders switched off, says more.
 * The water glass sits under it, one slim row, rather than a card of its own.
 */
function StatusCard({
  snapshot,
  onPause,
  onUnmute,
  onWater,
}: {
  snapshot: FocusSnapshot;
  onPause: (choice: PauseChoice) => void;
  onUnmute: () => void;
  onWater: (steps: 1 | -1) => void;
}) {
  const { t } = useSettings();
  const numerals = useSentenceNumerals();
  const { settings, status } = snapshot;
  const [menu, setMenu] = useState(false);
  // A preview is an example, not a break that is due.
  const due = snapshot.activeBreak && !snapshot.activeBreak.preview ? snapshot.activeBreak : null;
  const [next] = upcoming(snapshot);

  let lead: ReactNode;
  let title: string;
  let detail: string | null = null;
  let action: ReactNode = null;
  let eyebrow: ReactNode = null;

  if (due) {
    lead = <Ring fraction={1} color={KIND_TINTS[due.kind]} label="" size={44} due />;
    title = t("focus.now.title").replace("{kind}", kindLabel(due.kind, settings, t));
    detail = t("focus.ring.card-open");
  } else if (status === "muted") {
    lead = <Chip icon="bellOff" tint="var(--color-text-secondary)" />;
    title = t("focus.muted.title");
    detail = t("focus.muted.detail");
    action = (
      <button
        type="button"
        onClick={onUnmute}
        className="settings-btn settings-btn--accent shrink-0 rounded-full px-3 text-[12px]"
      >
        {t("focus.muted.turn-on")}
      </button>
    );
  } else if (status === "paused" && snapshot.pausedUntil) {
    lead = <Chip icon="pause" tint="var(--color-text-secondary)" />;
    title = snapshot.pausedUntilResumed
      ? t("focus.status.paused")
      : t("focus.paused.title").replace("{time}", time(snapshot.pausedUntil));
    action = (
      <button
        type="button"
        onClick={() => onPause("resume")}
        className="settings-btn settings-btn--accent shrink-0 rounded-full px-3 text-[12px]"
      >
        {t("focus.resume")}
      </button>
    );
  } else if (status === "held" && snapshot.hold) {
    lead = <Chip icon={HOLD_ICONS[snapshot.hold]} tint="var(--color-accent-mark)" />;
    title = t("focus.held.title").replace("{what}", t(HOLD_LABELS[snapshot.hold]));
  } else if (status === "afterHours") {
    lead = <Chip icon="moon" tint="var(--color-accent-mark)" />;
    title = t("focus.after-hours.title").replace("{time}", clock(snapshot.settings.startWorkAt));
  } else if (status === "dayOff") {
    const holiday = snapshot.dayOff === "publicHoliday";
    lead = <Chip icon="sun" tint={holiday ? "var(--color-holiday)" : "var(--color-accent-mark)"} />;
    title = t(holiday ? "focus.day-off.holiday" : "focus.day-off.weekly");
  } else if (next && next.minutesLeft !== null) {
    const away = status === "away";
    lead = (
      <Ring
        fraction={1 - next.minutesLeft / Math.max(1, next.everyMinutes)}
        color={KIND_TINTS[next.kind]}
        label={`${digits(next.minutesLeft, numerals)}${t("focus.m-short")}`}
        size={44}
        resting={away}
      />
    );
    // The ring has the minutes: the words only say what comes.
    title = kindLabel(next.kind, settings, t);
    action = <PauseMenu open={menu} setOpen={setMenu} onPause={onPause} />;
    if (snapshot.dayOff && settings.daysOff === "lighter") {
      eyebrow = (
        <span
          className="mb-0.5 inline-flex items-center gap-1 text-[10px] font-medium"
          style={{
            color:
              snapshot.dayOff === "publicHoliday"
                ? "var(--color-holiday)"
                : "var(--color-accent-mark)",
          }}
        >
          <Icon name="sun" className="size-2.5" />
          {t(
            snapshot.dayOff === "publicHoliday" ? "focus.day-off.holiday" : "focus.day-off.weekly",
          )}
        </span>
      );
    }
  } else {
    const done = settings.water.enabled && snapshot.today.waterMl >= settings.waterGoalMl;
    lead = <Chip icon={done ? "checkmark" : "focus"} tint="var(--color-positive)" />;
    title = t(done ? "focus.quiet.done" : "focus.quiet.idle");
  }

  return (
    <section className="surface-card relative" aria-live="polite">
      <div className="flex items-center gap-3 p-3">
        {lead}
        <div className="min-w-0 flex-1">
          {eyebrow}
          <p className="text-balance text-[13.5px] font-semibold leading-snug">{title}</p>
          {detail && (
            <p className="mt-0.5 text-balance text-[11px] leading-snug text-text-muted">{detail}</p>
          )}
        </div>
        {action}
      </div>
      {settings.water.enabled && <WaterRow snapshot={snapshot} onWater={onWater} />}
    </section>
  );
}

/** One Pause button; its three lengths open beneath it. */
function PauseMenu({
  open,
  setOpen,
  onPause,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  onPause: (choice: PauseChoice) => void;
}) {
  const { t } = useSettings();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Close the menu, not the popover.
      event.preventDefault();
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, setOpen]);

  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="settings-btn inline-flex items-center gap-1.5 rounded-full px-3 text-[12px]"
      >
        <Icon name="pause" className="size-3" />
        {t("focus.pause")}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute top-full right-0 z-20 mt-1.5 w-[168px] rounded-[10px] border border-[color:var(--color-border)] bg-surface-raised p-1 shadow-lg"
        >
          <p className="px-2.5 pt-1 pb-0.5 text-[10px] text-text-muted">{t("focus.pause-title")}</p>
          {PAUSES.map((pause) => (
            <button
              key={pause.choice}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onPause(pause.choice);
              }}
              className="block w-full cursor-pointer rounded-[6px] px-2.5 py-1.5 text-left text-[12px] hover:bg-surface-hover"
            >
              {t(pause.label)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Today and the week in one card, one at a time: two cards of numbers
 * stacked on the same screen read as a wall. The week waits for a second
 * day; one day of "week" is the same as today. */
function DayCard({ snapshot }: { snapshot: FocusSnapshot }) {
  const { t } = useSettings();
  const [view, setView] = useState<"today" | "week">("today");
  const week = snapshot.summary.trackedDays > 1;
  const showing = week ? view : "today";

  return (
    <section className="surface-card space-y-2.5 p-3">
      {week ? (
        <Segmented
          label={t("focus.day.label")}
          value={view}
          onChange={setView}
          size="sm"
          options={[
            { id: "today", label: t("focus.day.today") },
            { id: "week", label: t("focus.day.week") },
          ]}
        />
      ) : (
        <h2 className="text-[11px] font-semibold text-text-secondary">{t("focus.today.title")}</h2>
      )}
      {showing === "today" ? (
        <TodayStats snapshot={snapshot} />
      ) : (
        <WeekCard snapshot={snapshot} bare />
      )}
    </section>
  );
}

/** Today in three numbers, with screen time measured against a usual day. */
function TodayStats({ snapshot }: { snapshot: FocusSnapshot }) {
  const { t } = useSettings();
  const numerals = useSentenceNumerals();
  const { today, usualScreenSeconds } = snapshot;
  const taken = today.eyes.taken + today.move.taken;
  const reminded = Math.max(taken, today.eyes.reminded + today.move.reminded);

  return (
    <div className="space-y-2.5">
      {usualScreenSeconds !== null && (
        <p className="truncate text-[10px] text-text-muted">
          {t("focus.today.usual").replace("{d}", duration(usualScreenSeconds, numerals, t))}
        </p>
      )}
      <div className="grid grid-cols-3 gap-2">
        <Stat value={duration(today.screenSeconds, numerals, t)} label={t("focus.today.screen")} />
        <Stat
          value={
            <>
              {digits(taken, numerals)}
              <span className="text-[11px] font-medium text-text-muted">
                {" "}
                {t("focus.today.of").replace("{n}", digits(reminded, numerals))}
              </span>
            </>
          }
          label={t("focus.today.breaks")}
        />
        <Stat
          value={duration(today.longestStretchSeconds, numerals, t)}
          label={t("focus.today.stretch")}
        />
      </div>
      {usualScreenSeconds !== null && (
        <div
          className="h-1 overflow-hidden rounded-full bg-[color:var(--color-divider)]"
          aria-hidden="true"
        >
          <div
            className="h-full rounded-full bg-[color:var(--color-accent-mark)] transition-[width] duration-500"
            style={{
              width: `${Math.min(1, today.screenSeconds / Math.max(1, usualScreenSeconds)) * 100}%`,
            }}
          />
        </div>
      )}
    </div>
  );
}

function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[15px] font-bold tabular-nums">{value}</p>
      {/* Wraps: "longest without a break" is the label that explains the
          number, so it is never cut. */}
      <p className="text-[10px] leading-snug text-text-muted">{label}</p>
    </div>
  );
}

/**
 * Water, as one row under the status: tap the glass for a glass more, the
 * bar fills toward the day's goal, Undo takes the last one back. It is the
 * one thing logged by hand, so the tap should feel like it did something.
 */
function WaterRow({
  snapshot,
  onWater,
}: {
  snapshot: FocusSnapshot;
  onWater: (steps: 1 | -1) => void;
}) {
  const { t } = useSettings();
  const numerals = useSentenceNumerals();
  const { today, settings, waterStepMl } = snapshot;
  const [splash, setSplash] = useState(0);
  const fraction = Math.min(1, today.waterMl / Math.max(1, settings.waterGoalMl));
  const level = 68 * fraction;
  const add = t("focus.water-add").replace("{n}", String(waterStepMl));

  return (
    <div className="flex items-center gap-2.5 border-t border-divider px-3 py-2">
      <button
        type="button"
        onClick={() => {
          onWater(1);
          setSplash((count) => count + 1);
        }}
        aria-label={add}
        title={add}
        className="focus-glass relative shrink-0 cursor-pointer"
      >
        <svg width="18" height="22" viewBox="0 0 64 80" aria-hidden="true">
          <defs>
            <clipPath id="focus-glass-shape">
              <path d="M10 6 L54 6 L48 74 L16 74 Z" />
            </clipPath>
          </defs>
          <rect
            className="focus-glass__water"
            x="0"
            y={74 - level}
            width="64"
            height={level + 6}
            clipPath="url(#focus-glass-shape)"
            fill="var(--color-weather-tint)"
            opacity="0.85"
          />
          <path
            d="M10 6 L54 6 L48 74 L16 74 Z"
            fill="none"
            stroke="var(--color-weather-tint)"
            strokeWidth="5"
            strokeLinejoin="round"
          />
        </svg>
        {splash > 0 && (
          <span key={splash} className="focus-glass__splash" aria-hidden="true">
            +1
          </span>
        )}
      </button>
      <p className="shrink-0 text-[11.5px] font-medium tabular-nums">
        {t("focus.water.amount")
          .replace("{done}", litres(today.waterMl, numerals))
          .replace("{goal}", litres(settings.waterGoalMl, numerals))}
      </p>
      {/* Litres, not glasses: the goal is set in litres, so progress is too. */}
      <div
        className="h-[4px] min-w-0 flex-1 overflow-hidden rounded-full bg-[color:var(--color-divider)]"
        aria-hidden="true"
      >
        <div
          className="h-full rounded-full bg-[color:var(--color-weather-tint)] transition-[width] duration-300"
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
      {today.waterMl > 0 && (
        <button
          type="button"
          onClick={() => onWater(-1)}
          aria-label={t("focus.water-remove").replace("{n}", String(waterStepMl))}
          className="shrink-0 cursor-pointer text-[11px] text-text-muted transition-colors hover:text-text"
        >
          {t("focus.water.undo")}
        </button>
      )}
      {/* The glass is a button too, but nothing says so: this one does. */}
      <button
        type="button"
        onClick={() => {
          onWater(1);
          setSplash((count) => count + 1);
        }}
        aria-label={add}
        className="settings-btn shrink-0 rounded-full px-2.5 text-[11px]"
      >
        {t("focus.water.add-short").replace("{n}", digits(waterStepMl, numerals))}
      </button>
    </div>
  );
}
