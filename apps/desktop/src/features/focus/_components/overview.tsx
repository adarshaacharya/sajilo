import { type ReactNode, useEffect, useRef, useState } from "react";
import { Icon } from "../../../shared/components/icon";
import { useSettings } from "../../../shared/context/settings-context";
import type { BreakKind, FocusSettings, FocusSnapshot, PauseChoice } from "../../../shared/lib/ipc";
import { digits } from "../../../shared/lib/numerals";
import {
  clock,
  duration,
  type I18nKey,
  KIND_ICONS,
  KIND_TINTS,
  kindLabel,
  litres,
  useSentenceNumerals,
} from "../_lib/format";
import { WeekCard } from "./week-card";

const PAUSES = [
  { choice: "halfHour", label: "focus.pause-half-hour" },
  { choice: "hour", label: "focus.pause-hour" },
  { choice: "restOfDay", label: "focus.pause-rest-of-day" },
] as const satisfies readonly { choice: PauseChoice; label: I18nKey }[];

/** The reminders with a tile of their own; the custom one joins once named. */
const TILE_KINDS = ["eyes", "move", "water", "custom"] as const;
type TileKind = (typeof TILE_KINDS)[number];

/** Screen time that fills the Today tile: a full working day. */
const FULL_DAY_SECONDS = 8 * 60 * 60;

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function time(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/**
 * The tab once reminders are on: a ring that fills as the next break comes
 * closer, today at a glance, the water glass, and the reminders as tiles.
 * Every number is the engine's; this only draws them.
 */
export function Overview({
  snapshot,
  onSettings,
  onWater,
  onPause,
  onOpenSettings,
}: {
  snapshot: FocusSnapshot;
  onSettings: (settings: FocusSettings) => void;
  onWater: (steps: 1 | -1) => void;
  onPause: (choice: PauseChoice) => void;
  onOpenSettings: () => void;
}) {
  const { t } = useSettings();
  const { settings } = snapshot;
  const kinds = TILE_KINDS.filter((kind) => kind !== "custom" || settings.custom.label.trim());

  return (
    <div className="space-y-2.5">
      <BreakRing snapshot={snapshot} onPause={onPause} />
      <TodayTiles snapshot={snapshot} />
      {settings.water.enabled && <WaterGlass snapshot={snapshot} onWater={onWater} />}

      <section aria-labelledby="focus-tiles-title" className="space-y-1.5">
        <div className="flex items-baseline justify-between px-0.5">
          <h2 id="focus-tiles-title" className="text-[11px] font-semibold text-text-secondary">
            {t("focus.tiles.title")}
          </h2>
          <span className="text-[10px] text-text-muted">{t("focus.tiles.hint")}</span>
        </div>
        <div className={`grid gap-2 ${kinds.length === 4 ? "grid-cols-4" : "grid-cols-3"}`}>
          {kinds.map((kind) => (
            <ReminderTile
              key={kind}
              kind={kind}
              settings={settings}
              onToggle={(enabled) =>
                onSettings({ ...settings, [kind]: { ...settings[kind], enabled } })
              }
            />
          ))}
        </div>
      </section>

      <WeekCard snapshot={snapshot} />

      <button
        type="button"
        onClick={onOpenSettings}
        className="surface-card flex w-full cursor-pointer items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-surface-hover"
      >
        <Icon name="settings" className="size-3.5 text-text-muted" />
        <span className="flex-1 text-[12px] font-medium">{t("focus.settings-link")}</span>
        <span className="text-[12px] text-text-muted" aria-hidden="true">
          ›
        </span>
      </button>
    </div>
  );
}

/**
 * The next break as a ring that fills while it comes closer, in that break's
 * colour, with the minutes left in the middle. When nothing counts down —
 * paused, after hours, a day off or a holiday — the ring rests and says why.
 */
function BreakRing({
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

  const next = snapshot.breaks
    .filter((item) => item.enabled && item.minutesLeft !== null)
    .sort((a, b) => (a.minutesLeft ?? 0) - (b.minutesLeft ?? 0))[0];
  // A preview is an example, not a break that is due.
  const due = snapshot.activeBreak && !snapshot.activeBreak.preview ? snapshot.activeBreak : null;

  let fill = 0;
  let color = "var(--color-text-muted)";
  let resting = true;
  let body: ReactNode;

  if (due) {
    fill = 1;
    color = KIND_TINTS[due.kind];
    resting = false;
    body = (
      <>
        <KindChip kind={due.kind} settings={settings} />
        <p className="text-[26px] font-bold leading-tight">{t("focus.ring.now")}</p>
        <p className="text-[11px] text-text-muted">{t("focus.ring.card-open")}</p>
      </>
    );
  } else if (status === "paused" && snapshot.pausedUntil) {
    fill = 0.35;
    body = (
      <>
        <p className="text-[11px] text-text-muted">{t("focus.quiet.paused")}</p>
        <p className="whitespace-nowrap text-[21px] font-bold leading-tight tabular-nums">
          {time(snapshot.pausedUntil)}
        </p>
        <p className="text-[11px] text-text-muted">{t("focus.ring.comes-back")}</p>
      </>
    );
  } else if (status === "holiday" || status === "dayOff" || status === "outsideHours") {
    fill = 1;
    color = status === "holiday" ? "var(--color-holiday)" : "var(--color-text-muted)";
    const [title, detail] =
      status === "holiday"
        ? [t("focus.quiet.holiday"), t("focus.quiet.holiday-detail")]
        : status === "dayOff"
          ? [t("focus.quiet.day-off"), t("focus.quiet.day-off-detail")]
          : [
              t("focus.quiet.outside"),
              t("focus.quiet.outside-hours")
                .replace("{start}", clock(settings.workStart))
                .replace("{end}", clock(settings.workEnd)),
            ];
    body = (
      <>
        <p className="text-balance text-[16px] font-bold leading-tight">{title}</p>
        <p className="mt-0.5 text-balance text-[10px] leading-snug text-text-muted">{detail}</p>
      </>
    );
  } else if (next && next.minutesLeft !== null) {
    fill = Math.min(1, Math.max(0, 1 - next.minutesLeft / Math.max(1, next.everyMinutes)));
    color = KIND_TINTS[next.kind];
    resting = status === "away";
    body = (
      <>
        <KindChip kind={next.kind} settings={settings} />
        <p className="text-[34px] font-bold leading-none tracking-[-0.02em] tabular-nums">
          {digits(next.minutesLeft, numerals)}
          <span className="ml-0.5 text-[13px] font-semibold tracking-normal text-text-muted">
            {t("focus.minutes-unit")}
          </span>
        </p>
        <p className="mt-0.5 text-balance text-[10px] leading-snug text-text-muted">
          {t(status === "away" ? "focus.next.away" : "focus.ring.until")}
        </p>
      </>
    );
  } else {
    const done = settings.water.enabled && snapshot.today.waterMl >= settings.waterGoalMl;
    fill = done ? 1 : 0;
    color = "var(--color-positive)";
    body = (
      <>
        <p className="text-balance text-[16px] font-bold leading-tight">
          {t(done ? "focus.quiet.done" : "focus.quiet.idle")}
        </p>
        <p className="mt-0.5 text-balance text-[10px] leading-snug text-text-muted">
          {t(done ? "focus.quiet.done-detail" : "focus.quiet.idle-detail")}
        </p>
      </>
    );
  }

  const counting = !due && status !== "paused" && next !== undefined && status === "active";

  return (
    <section className="surface-card relative flex flex-col items-center gap-2.5 px-3 pt-4 pb-3">
      <div
        className={`focus-ring relative size-[164px] ${due ? "focus-ring--due" : ""} ${
          resting && !due ? "focus-ring--resting" : ""
        }`}
      >
        <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden="true">
          <circle
            cx="60"
            cy="60"
            r={RADIUS}
            fill="none"
            stroke="var(--color-divider)"
            strokeWidth="10"
          />
          <circle
            className="focus-ring__fill"
            cx="60"
            cy="60"
            r={RADIUS}
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - fill)}
          />
        </svg>
        <div
          className="absolute inset-0 flex items-center justify-center text-center"
          aria-live="polite"
        >
          {/* The ring's inner opening is about 115px across; everything in
              it wraps inside that rather than running under the ring. */}
          <div className="flex w-[104px] flex-col items-center">{body}</div>
        </div>
      </div>

      {status === "paused" && snapshot.pausedUntil ? (
        <button
          type="button"
          onClick={() => onPause("resume")}
          className="settings-btn settings-btn--accent rounded-full px-4 text-[12px]"
        >
          {t("focus.resume")}
        </button>
      ) : counting || status === "away" ? (
        <PauseMenu open={menu} setOpen={setMenu} onPause={onPause} />
      ) : null}
    </section>
  );
}

function KindChip({ kind, settings }: { kind: BreakKind; settings: FocusSettings }) {
  const { t } = useSettings();
  return (
    <span className="mb-0.5 inline-flex items-center gap-1 text-[11px] text-text-secondary">
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ background: KIND_TINTS[kind] }}
        aria-hidden="true"
      />
      <span className="truncate">{kindLabel(kind, settings, t)}</span>
    </span>
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
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="settings-btn inline-flex items-center gap-1.5 rounded-full px-3.5 text-[12px]"
      >
        <Icon name="pause" className="size-3" />
        {t("focus.pause")}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute top-full left-1/2 z-20 mt-1.5 w-[168px] -translate-x-1/2 rounded-[10px] border border-[color:var(--color-border)] bg-surface-raised p-1 shadow-lg"
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

/** Today in three small tiles: screen time, breaks taken, water. */
function TodayTiles({ snapshot }: { snapshot: FocusSnapshot }) {
  const { t } = useSettings();
  const numerals = useSentenceNumerals();
  const { today, settings } = snapshot;
  const taken = today.eyes.taken + today.move.taken;
  const reminded = Math.max(taken, today.eyes.reminded + today.move.reminded);
  const dots = Math.min(reminded, 8);

  return (
    <div className={`grid gap-2 ${settings.water.enabled ? "grid-cols-3" : "grid-cols-2"}`}>
      <Tile label={t("focus.today.screen")}>
        <p className="text-[15px] font-bold tabular-nums">
          {duration(today.screenSeconds, numerals, t)}
        </p>
        <Meter fraction={today.screenSeconds / FULL_DAY_SECONDS} color="var(--color-accent-mark)" />
      </Tile>
      <Tile label={t("focus.today.breaks")}>
        <p className="text-[15px] font-bold tabular-nums">
          {digits(taken, numerals)}
          <span className="text-[11px] font-medium text-text-muted">
            {" "}
            / {digits(reminded, numerals)}
          </span>
        </p>
        <div className="flex h-[7px] flex-wrap gap-[3px]" aria-hidden="true">
          {Array.from({ length: dots }, (_, index) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: dots have no identity
              key={index}
              className="size-[7px] rounded-full transition-colors duration-300"
              style={{
                background: index < taken ? "var(--color-positive)" : "var(--color-divider)",
              }}
            />
          ))}
        </div>
      </Tile>
      {settings.water.enabled && (
        <Tile label={t("focus.today.water")}>
          <p className="text-[15px] font-bold tabular-nums">
            {litres(today.waterMl, numerals)}
            <span className="text-[11px] font-medium text-text-muted">
              {" "}
              / {litres(settings.waterGoalMl, numerals)} {t("focus.litres-short")}
            </span>
          </p>
          <Meter
            fraction={today.waterMl / Math.max(1, settings.waterGoalMl)}
            color="var(--color-weather-tint)"
          />
        </Tile>
      )}
    </div>
  );
}

function Tile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="surface-card flex min-w-0 flex-col gap-1.5 p-2.5">
      <p className="truncate text-[10px] text-text-muted">{label}</p>
      {children}
    </div>
  );
}

function Meter({ fraction, color }: { fraction: number; color: string }) {
  return (
    <div
      className="h-1 overflow-hidden rounded-full bg-[color:var(--color-divider)]"
      aria-hidden="true"
    >
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${Math.min(1, Math.max(0, fraction)) * 100}%`, background: color }}
      />
    </div>
  );
}

/**
 * The water logger as a glass: tap it and it fills by one step. Water is the
 * one thing logged by hand, so the tap should feel like it did something.
 */
function WaterGlass({
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
  const step = digits(waterStepMl, numerals);

  return (
    <section className="surface-card grid grid-cols-[56px_1fr] items-center gap-3 p-3">
      <button
        type="button"
        onClick={() => {
          onWater(1);
          setSplash((count) => count + 1);
        }}
        aria-label={t("focus.water-add").replace("{n}", String(waterStepMl))}
        className="focus-glass relative cursor-pointer"
      >
        <svg width="56" height="70" viewBox="0 0 64 80" aria-hidden="true">
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
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
        </svg>
        {splash > 0 && (
          <span key={splash} className="focus-glass__splash" aria-hidden="true">
            +{step} {t("focus.ml-unit")}
          </span>
        )}
      </button>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold">
          {t("focus.water.title")
            .replace("{done}", litres(today.waterMl, numerals))
            .replace("{goal}", litres(settings.waterGoalMl, numerals))}
        </p>
        <p className="mt-0.5 text-[11px] text-text-muted">
          {t(fraction >= 1 ? "focus.quiet.done-detail" : "focus.water.hint")}
        </p>
        {today.waterMl > 0 && (
          <button
            type="button"
            onClick={() => onWater(-1)}
            className="mt-2 cursor-pointer rounded-full border border-[color:var(--color-border)] px-2.5 py-0.5 text-[11px] text-text-secondary transition-colors hover:bg-surface-hover"
          >
            {t("focus.water.undo")}
          </button>
        )}
      </div>
    </section>
  );
}

/** A reminder as a tile: lit when on, dimmed when off, one tap either way. */
function ReminderTile({
  kind,
  settings,
  onToggle,
}: {
  kind: TileKind;
  settings: FocusSettings;
  onToggle: (enabled: boolean) => void;
}) {
  const { t } = useSettings();
  const numerals = useSentenceNumerals();
  const rule = settings[kind];
  const tint = KIND_TINTS[kind];

  return (
    <button
      type="button"
      aria-pressed={rule.enabled}
      onClick={() => onToggle(!rule.enabled)}
      className={`surface-card flex min-w-0 cursor-pointer flex-col items-center gap-1.5 px-1.5 py-2.5 text-center transition-[opacity,border-color,transform] duration-200 active:scale-[0.97] ${
        rule.enabled ? "" : "opacity-50"
      }`}
      style={
        rule.enabled
          ? { borderColor: `color-mix(in srgb, ${tint} 45%, var(--color-border))` }
          : undefined
      }
    >
      <span
        className="flex size-8 items-center justify-center rounded-full transition-colors"
        style={{
          color: rule.enabled ? tint : "var(--color-text-muted)",
          background: rule.enabled
            ? `color-mix(in srgb, ${tint} 16%, transparent)`
            : "var(--color-divider)",
        }}
      >
        <Icon name={KIND_ICONS[kind]} className="size-3.5" />
      </span>
      <span className="w-full truncate text-[12px] font-medium">
        {kindLabel(kind, settings, t)}
      </span>
      <span className="text-[10px] text-text-muted">
        {t(rule.enabled ? "focus.tiles.every" : "focus.tiles.off").replace(
          "{n}",
          digits(rule.everyMinutes, numerals),
        )}
      </span>
    </button>
  );
}
