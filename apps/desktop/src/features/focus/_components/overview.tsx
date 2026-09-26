import { type ReactNode, useEffect, useRef, useState } from "react";
import { Icon } from "../../../shared/components/icon";
import { useSettings } from "../../../shared/context/settings-context";
import type { BreakKind, FocusSettings, FocusSnapshot, PauseChoice } from "../../../shared/lib/ipc";
import { digits } from "../../../shared/lib/numerals";
import {
  duration,
  HOLD_ICONS,
  HOLD_LABELS,
  type I18nKey,
  KIND_TINTS,
  kindInSentence,
  kindLabel,
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
  onExample,
  onOpenSettings,
}: {
  snapshot: FocusSnapshot;
  onSettings: (settings: FocusSettings) => void;
  onWater: (steps: 1 | -1) => void;
  onPause: (choice: PauseChoice) => void;
  onExample: (kind: BreakKind) => void;
  onOpenSettings: () => void;
}) {
  const { t } = useSettings();

  return (
    <div className="space-y-2.5">
      <StatusCard snapshot={snapshot} onPause={onPause} />
      <TodayCard snapshot={snapshot} />
      {snapshot.settings.water.enabled && <WaterCard snapshot={snapshot} onWater={onWater} />}
      <ReminderList snapshot={snapshot} onSettings={onSettings} onExample={onExample} />
      <WeekCard snapshot={snapshot} />

      <button
        type="button"
        onClick={onOpenSettings}
        className="surface-card flex w-full cursor-pointer items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-surface-hover"
      >
        <Icon name="settings" className="size-3.5 text-text-muted" />
        <span className="flex-1 text-[12px] font-medium">{t("focus.settings-link")}</span>
        <Icon name="chevronRight" className="size-3 text-text-muted" />
      </button>
    </div>
  );
}

/**
 * What's next, in one card: a small ring and a sentence while a break counts
 * down, or a single line saying why nothing does — paused, a call, a day off.
 */
function StatusCard({
  snapshot,
  onPause,
}: {
  snapshot: FocusSnapshot;
  onPause: (choice: PauseChoice) => void;
}) {
  const { t } = useSettings();
  const numerals = useSentenceNumerals();
  const { settings, status } = snapshot;
  const [menu, setMenu] = useState(false);
  // A preview is an example, not a break that is due.
  const due = snapshot.activeBreak && !snapshot.activeBreak.preview ? snapshot.activeBreak : null;
  const [next, after] = upcoming(snapshot);

  let lead: ReactNode;
  let title: string;
  let detail: string;
  let action: ReactNode = null;
  let eyebrow: ReactNode = null;

  if (due) {
    lead = <Ring fraction={1} color={KIND_TINTS[due.kind]} label="" size={56} due />;
    title = t("focus.now.title").replace("{kind}", kindLabel(due.kind, settings, t));
    detail = t("focus.ring.card-open");
  } else if (status === "paused" && snapshot.pausedUntil) {
    lead = <Chip icon="pause" tint="var(--color-text-secondary)" />;
    title = t("focus.paused.title").replace("{time}", time(snapshot.pausedUntil));
    detail = t("focus.paused.detail");
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
    detail = t("focus.held.detail");
  } else if (status === "dayOff") {
    const holiday = snapshot.dayOff === "publicHoliday";
    lead = <Chip icon="sun" tint={holiday ? "var(--color-holiday)" : "var(--color-accent-mark)"} />;
    title = t(holiday ? "focus.day-off.holiday" : "focus.day-off.weekly");
    detail = t("focus.day-off.off-detail");
  } else if (next && next.minutesLeft !== null) {
    const away = status === "away";
    lead = (
      <Ring
        fraction={1 - next.minutesLeft / Math.max(1, next.everyMinutes)}
        color={KIND_TINTS[next.kind]}
        label={`${digits(next.minutesLeft, numerals)}${t("focus.m-short")}`}
        size={56}
        resting={away}
      />
    );
    title = t("focus.next.title")
      .replace("{kind}", kindLabel(next.kind, settings, t))
      .replace("{n}", digits(next.minutesLeft, numerals));
    detail = away
      ? t("focus.next.away")
      : after && after.minutesLeft !== null
        ? t("focus.next.then")
            .replace("{kind}", kindInSentence(after.kind, settings, t))
            .replace("{n}", digits(after.minutesLeft, numerals))
        : t("focus.next.only");
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
            snapshot.dayOff === "publicHoliday"
              ? "focus.day-off.holiday-lighter"
              : "focus.day-off.weekly-lighter",
          )}
        </span>
      );
    }
  } else {
    const done = settings.water.enabled && snapshot.today.waterMl >= settings.waterGoalMl;
    lead = <Chip icon={done ? "checkmark" : "focus"} tint="var(--color-positive)" />;
    title = t(done ? "focus.quiet.done" : "focus.quiet.idle");
    detail = t(done ? "focus.quiet.done-detail" : "focus.quiet.idle-detail");
  }

  return (
    <section className="surface-card relative flex items-center gap-3 p-3" aria-live="polite">
      {lead}
      <div className="min-w-0 flex-1">
        {eyebrow}
        <p className="text-balance text-[14px] font-semibold leading-snug">{title}</p>
        <p className="mt-0.5 text-balance text-[11px] leading-snug text-text-muted">{detail}</p>
      </div>
      {action}
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

/** Today in three numbers, with screen time measured against a usual day. */
function TodayCard({ snapshot }: { snapshot: FocusSnapshot }) {
  const { t } = useSettings();
  const numerals = useSentenceNumerals();
  const { today, usualScreenSeconds } = snapshot;
  const taken = today.eyes.taken + today.move.taken;
  const reminded = Math.max(taken, today.eyes.reminded + today.move.reminded);

  return (
    <section className="surface-card space-y-2.5 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[11px] font-semibold text-text-secondary">{t("focus.today.title")}</h2>
        {usualScreenSeconds !== null && (
          <span className="truncate text-[10px] text-text-muted">
            {t("focus.today.usual").replace("{d}", duration(usualScreenSeconds, numerals, t))}
          </span>
        )}
      </div>
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
    </section>
  );
}

function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[15px] font-bold tabular-nums">{value}</p>
      <p className="truncate text-[10px] text-text-muted">{label}</p>
    </div>
  );
}

/**
 * The water logger as a glass: tap it and it fills by one glass. Water is the
 * one thing logged by hand, so the tap should feel like it did something.
 */
function WaterCard({
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
  const step = Math.max(1, waterStepMl);
  const glasses = Math.floor(today.waterMl / step);
  const goal = Math.max(1, Math.round(settings.waterGoalMl / step));
  const fraction = Math.min(1, today.waterMl / Math.max(1, settings.waterGoalMl));
  const level = 68 * fraction;
  // Past sixteen the marks stop being countable at a glance.
  const marks = Math.min(goal, 16);

  return (
    <section className="surface-card grid grid-cols-[44px_1fr_auto] items-center gap-3 p-3">
      <button
        type="button"
        onClick={() => {
          onWater(1);
          setSplash((count) => count + 1);
        }}
        aria-label={t("focus.water-add").replace("{n}", String(waterStepMl))}
        className="focus-glass relative cursor-pointer"
      >
        <svg width="44" height="55" viewBox="0 0 64 80" aria-hidden="true">
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
            strokeWidth="2.6"
            strokeLinejoin="round"
          />
        </svg>
        {splash > 0 && (
          <span key={splash} className="focus-glass__splash" aria-hidden="true">
            +1
          </span>
        )}
      </button>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold">
          {t("focus.water.glasses")
            .replace("{done}", digits(glasses, numerals))
            .replace("{goal}", digits(goal, numerals))}
        </p>
        {/* Wraps rather than truncates: beside Undo there was room only for
            the instruction, and the glass size, the one number, was cut. */}
        <p className="mt-0.5 text-[11px] leading-snug text-text-muted">
          {fraction >= 1
            ? t("focus.quiet.done-detail")
            : t("focus.water.hint").replace("{n}", digits(waterStepMl, numerals))}
        </p>
        <div className="mt-2 flex gap-[3px]" aria-hidden="true">
          {Array.from({ length: marks }, (_, index) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: marks have no identity
              key={index}
              className="h-[5px] flex-1 rounded-[2px] transition-colors duration-300"
              style={{
                maxWidth: 14,
                background:
                  index < Math.round((glasses / goal) * marks)
                    ? "var(--color-weather-tint)"
                    : "var(--color-divider)",
              }}
            />
          ))}
        </div>
      </div>
      {today.waterMl > 0 && (
        <button
          type="button"
          onClick={() => onWater(-1)}
          aria-label={t("focus.water-remove").replace("{n}", String(waterStepMl))}
          className="cursor-pointer self-start rounded-full border border-[color:var(--color-border)] px-2.5 py-0.5 text-[11px] text-text-secondary transition-colors hover:bg-surface-hover"
        >
          {t("focus.water.undo")}
        </button>
      )}
    </section>
  );
}
