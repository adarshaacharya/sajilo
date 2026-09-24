import { Icon } from "../../../shared/components/icon";
import { Switch } from "../../../shared/components/switch";
import { useSettings } from "../../../shared/context/settings-context";
import type { BreakKind, FocusSettings, FocusSnapshot } from "../../../shared/lib/ipc";
import { digits } from "../../../shared/lib/numerals";
import {
  clock,
  KIND_ICONS,
  KIND_TINTS,
  kindLabel,
  litres,
  useSentenceNumerals,
} from "../_lib/format";
import { WeekCard } from "./week-card";

const NEXT_WHAT = {
  eyes: "focus.next.what.eyes",
  move: "focus.next.what.move",
  water: "focus.next.what.water",
} as const;

function time(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** One sentence, big: when the next break is, or why nothing is counting. */
function NextBreak({ snapshot }: { snapshot: FocusSnapshot }) {
  const { t } = useSettings();
  const numerals = useSentenceNumerals();
  const { settings, status } = snapshot;
  const next = snapshot.breaks
    .filter((item) => item.minutesLeft !== null)
    .sort((a, b) => (a.minutesLeft ?? 0) - (b.minutesLeft ?? 0))[0];

  let headline: string;
  let detail: string;
  if (status === "paused" && snapshot.pausedUntil) {
    headline = t("focus.quiet.paused");
    detail = t("focus.quiet.paused-until").replace("{time}", time(snapshot.pausedUntil));
  } else if (status === "outsideHours") {
    headline = t("focus.quiet.outside");
    detail = t("focus.quiet.outside-hours")
      .replace("{start}", clock(settings.workStart))
      .replace("{end}", clock(settings.workEnd));
  } else if (status === "dayOff") {
    headline = t("focus.quiet.day-off");
    detail = t("focus.quiet.day-off-detail");
  } else if (status === "holiday") {
    headline = t("focus.quiet.holiday");
    detail = t("focus.quiet.holiday-detail");
  } else if (status === "away" && next) {
    headline = t("focus.next.in").replace("{n}", digits(next.minutesLeft ?? 0, numerals));
    detail = t("focus.next.away");
  } else if (next) {
    headline = t("focus.next.in").replace("{n}", digits(next.minutesLeft ?? 0, numerals));
    detail =
      next.kind in NEXT_WHAT
        ? t(NEXT_WHAT[next.kind as keyof typeof NEXT_WHAT]).replace(
            "{n}",
            digits(next.breakSeconds, numerals),
          )
        : kindLabel(next.kind, settings, t);
  } else if (settings.water.enabled && snapshot.today.waterMl >= settings.waterGoalMl) {
    headline = t("focus.quiet.done");
    detail = t("focus.quiet.done-detail");
  } else {
    headline = t("focus.quiet.idle");
    detail = t("focus.quiet.idle-detail");
  }

  return (
    <div className="px-1 pb-1">
      <p className="text-[11px] text-text-muted">{t("focus.next.label")}</p>
      <p className="mt-0.5 text-[24px] font-semibold leading-tight tracking-[-0.01em] tabular-nums">
        {headline}
      </p>
      <p className="mt-0.5 text-[12px] text-text-secondary">{detail}</p>
    </div>
  );
}

function Row({
  kind,
  label,
  on,
  onToggle,
  children,
}: {
  kind: BreakKind;
  label: string;
  on: boolean;
  onToggle: (on: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-12 items-center gap-2.5 py-2">
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-full"
        style={{
          color: KIND_TINTS[kind],
          background: `color-mix(in srgb, ${KIND_TINTS[kind]} 14%, transparent)`,
        }}
      >
        <Icon name={KIND_ICONS[kind]} className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{label}</span>
      {children}
      <Switch checked={on} onChange={onToggle} />
    </div>
  );
}

/** The tab once reminders are on: what's next, three switches, pause. */
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
  onPause: (pause: boolean) => void;
  onOpenSettings: () => void;
}) {
  const { t } = useSettings();
  const numerals = useSentenceNumerals();
  const { settings, today } = snapshot;
  const toggle = (kind: "eyes" | "move" | "water" | "custom") => (enabled: boolean) =>
    onSettings({ ...settings, [kind]: { ...settings[kind], enabled } });
  const label = (kind: BreakKind) => kindLabel(kind, settings, t);

  return (
    <div className="space-y-2.5">
      <section className="surface-card p-3">
        <NextBreak snapshot={snapshot} />
      </section>

      <section className="surface-card divide-y divide-divider px-3">
        <Row
          kind="eyes"
          label={label("eyes")}
          on={settings.eyes.enabled}
          onToggle={toggle("eyes")}
        />
        <Row
          kind="move"
          label={label("move")}
          on={settings.move.enabled}
          onToggle={toggle("move")}
        />
        {/* The user's own reminder gets a row once it has a name; it is
            written in Settings. */}
        {settings.custom.label.trim() && (
          <Row
            kind="custom"
            label={label("custom")}
            on={settings.custom.enabled}
            onToggle={toggle("custom")}
          />
        )}
        <Row
          kind="water"
          label={label("water")}
          on={settings.water.enabled}
          onToggle={toggle("water")}
        >
          {/* A stepper: − amount +. The minus undoes a mistaken tap; on an
              empty day there is nothing to undo, so it is hidden but keeps
              its place and the amount does not shift. */}
          <button
            type="button"
            aria-label={t("focus.water-remove").replace("{n}", String(snapshot.waterStepMl))}
            title={t("focus.water-remove").replace("{n}", String(snapshot.waterStepMl))}
            onClick={() => onWater(-1)}
            className={`icon-btn size-6 shrink-0 ${today.waterMl > 0 ? "" : "invisible"}`}
          >
            <Icon name="minus" className="size-3" />
          </button>
          <span className="shrink-0 text-[11px] tabular-nums text-text-secondary">
            {litres(today.waterMl, numerals)} / {litres(settings.waterGoalMl, numerals)}{" "}
            {t("focus.litres-unit")}
          </span>
          <button
            type="button"
            aria-label={t("focus.water-add").replace("{n}", String(snapshot.waterStepMl))}
            title={t("focus.water-add").replace("{n}", String(snapshot.waterStepMl))}
            onClick={() => onWater(1)}
            className="icon-btn size-6 shrink-0 text-[color:var(--color-weather-tint)]"
          >
            <Icon name="plus" className="size-3" />
          </button>
        </Row>
      </section>

      <WeekCard snapshot={snapshot} />

      <div className="flex gap-2">
        {snapshot.pausedUntil ? (
          <button
            type="button"
            onClick={() => onPause(false)}
            className="settings-btn flex-1 justify-center text-center text-[12px]"
          >
            {t("focus.resume")}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onPause(true)}
            className="settings-btn flex-1 justify-center text-center text-[12px]"
          >
            {t("focus.pause-hour")}
          </button>
        )}
        <button
          type="button"
          onClick={onOpenSettings}
          className="settings-btn flex items-center gap-1.5 text-[12px]"
        >
          <Icon name="settings" className="size-3" />
          {t("focus.settings")}
        </button>
      </div>
    </div>
  );
}
