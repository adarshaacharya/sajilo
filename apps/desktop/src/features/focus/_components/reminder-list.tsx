import { type ReactNode, useEffect, useState } from "react";
import { CONTROL } from "../../../shared/components/control";
import { Icon } from "../../../shared/components/icon";
import { Switch } from "../../../shared/components/switch";
import { TimeField } from "../../../shared/components/time-field";
import { useSettings } from "../../../shared/context/settings-context";
import type {
  BreakKind,
  FocusSettings,
  FocusSnapshot,
  NextBreak,
  TimedRule,
} from "../../../shared/lib/ipc";
import { digits } from "../../../shared/lib/numerals";
import {
  clock,
  KIND_ICONS,
  KIND_TINTS,
  kindLabel,
  litres,
  parseClock,
  type TFn,
  useSentenceNumerals,
  workDaysText,
} from "../_lib/format";
import { NumberField } from "./number-field";

type IntervalKind = "eyes" | "move" | "water" | "custom";
type MealKind = "breakfast" | "lunch" | "dinner" | "bedtime";
type RowKind = IntervalKind | MealKind | "endOfDay";

const INTERVALS: IntervalKind[] = ["eyes", "move", "water", "custom"];
const MEALS: MealKind[] = ["breakfast", "lunch", "dinner", "bedtime"];

/** A break's length as the row says it: "20 s", or "2 min" from a minute up. */
function length(seconds: number, numerals: ReturnType<typeof useSentenceNumerals>, t: TFn) {
  return seconds >= 60
    ? t("focus.len.m").replace("{n}", digits(Math.round(seconds / 60), numerals))
    : t("focus.len.s").replace("{n}", digits(seconds, numerals));
}

/**
 * Every reminder as one row: what it is, when it comes, and a switch. A tap
 * opens the row in place to change its interval, length or time, so there is
 * no separate table of numbers to find in Settings.
 */
export function ReminderList({
  snapshot,
  onSettings,
  onExample,
  onCustomise,
}: {
  snapshot: FocusSnapshot;
  onSettings: (settings: FocusSettings) => void;
  onExample: (kind: BreakKind) => void;
  /** Opens Routine's settings: when not to interrupt, days off, the card. */
  onCustomise: () => void;
}) {
  const { t } = useSettings();
  const numerals = useSentenceNumerals();
  const { settings } = snapshot;
  const [open, setOpen] = useState<RowKind | null>(null);
  const toggleOpen = (kind: RowKind) => setOpen((current) => (current === kind ? null : kind));
  const item = (kind: BreakKind) => snapshot.breaks.find((each) => each.kind === kind);

  const intervalDetail = (kind: IntervalKind, rule: NextBreak): string => {
    if (kind === "custom" && !settings.custom.label.trim()) return t("focus.row.custom-empty");
    if (rule.restsToday) return t("focus.row.rests");
    if (kind === "water") {
      if (snapshot.today.waterMl >= settings.waterGoalMl) return t("focus.row.water-done");
      return t("focus.row.water").replace("{n}", digits(rule.everyMinutes, numerals));
    }
    const every = t("focus.row.every").replace("{n}", digits(rule.everyMinutes, numerals));
    return rule.breakSeconds > 0 ? `${every} · ${length(rule.breakSeconds, numerals, t)}` : every;
  };

  const setMeal = (meal: MealKind, rule: TimedRule) =>
    onSettings({ ...settings, routine: { ...settings.routine, [meal]: rule } });

  return (
    <section aria-labelledby="focus-list-title" className="space-y-1.5">
      {/* Customise sits with the reminders it adjusts, not in the top bar
          (too far from them) or at the foot of the screen (never found). */}
      <div className="flex items-center justify-between gap-2 px-0.5">
        <h2 id="focus-list-title" className="text-[11px] font-semibold text-text-secondary">
          {t("focus.list.title")}
        </h2>
        <button type="button" onClick={onCustomise} className="focus-customise-btn">
          <Icon name="sliders" className="size-3" />
          {t("focus.header.customise")}
        </button>
      </div>
      <div className="surface-card overflow-hidden">
        {INTERVALS.map((kind) => {
          const rule = item(kind);
          if (!rule) return null;
          const on =
            kind === "custom"
              ? settings.custom.enabled && settings.custom.label.trim().length > 0
              : settings[kind].enabled;
          return (
            <Row
              key={kind}
              kind={kind}
              name={
                kind === "custom" && !settings.custom.label.trim()
                  ? t("focus.custom.title")
                  : kindLabel(kind, settings, t)
              }
              detail={intervalDetail(kind, rule)}
              on={on}
              dim={rule.restsToday}
              open={open === kind}
              onOpen={() => toggleOpen(kind)}
              onToggle={(enabled) => {
                if (kind === "custom") {
                  // Naming it is what turns it on; an unnamed one opens to be named.
                  if (enabled && !settings.custom.label.trim()) setOpen("custom");
                  onSettings({ ...settings, custom: { ...settings.custom, enabled } });
                } else {
                  onSettings({ ...settings, [kind]: { ...settings[kind], enabled } });
                }
              }}
            >
              <IntervalEditor
                kind={kind}
                rule={rule}
                snapshot={snapshot}
                onSettings={onSettings}
                onExample={onExample}
              />
            </Row>
          );
        })}

        <p className="border-t border-divider px-3 pt-2 pb-0.5 text-[10px] font-semibold text-text-muted">
          {t("focus.list.daily")}
        </p>
        {MEALS.map((meal) => {
          const rule = settings.routine[meal];
          return (
            <Row
              key={meal}
              kind={meal}
              name={t(`focus.kind.${meal}`)}
              detail={clock(rule.at)}
              on={rule.enabled}
              open={open === meal}
              onOpen={() => toggleOpen(meal)}
              onToggle={(enabled) => setMeal(meal, { ...rule, enabled })}
            >
              <EditLine label={t("focus.edit.at")}>
                <div className="w-[96px]">
                  <TimeField
                    value={clock(rule.at)}
                    ariaLabel={t(`focus.kind.${meal}`)}
                    onChange={(value) => {
                      const at = parseClock(value);
                      if (at) setMeal(meal, { ...rule, at });
                    }}
                  />
                </div>
              </EditLine>
            </Row>
          );
        })}
        <Row
          kind="endOfDay"
          name={t("focus.kind.endOfDay")}
          detail={
            snapshot.dayOff && settings.endOfDay
              ? t("focus.row.stop-rests")
              : t("focus.row.stop")
                  .replace("{time}", clock(settings.stopWorkAt))
                  .replace("{days}", workDaysText(settings.workDays, t))
          }
          on={settings.endOfDay}
          dim={settings.endOfDay && snapshot.dayOff !== null}
          open={open === "endOfDay"}
          onOpen={() => toggleOpen("endOfDay")}
          onToggle={(endOfDay) => onSettings({ ...settings, endOfDay })}
        >
          <EditLine label={t("focus.edit.at")}>
            <div className="w-[96px]">
              <TimeField
                value={clock(settings.stopWorkAt)}
                ariaLabel={t("focus.kind.endOfDay")}
                onChange={(value) => {
                  const stopWorkAt = parseClock(value);
                  if (stopWorkAt) onSettings({ ...settings, stopWorkAt });
                }}
              />
            </div>
          </EditLine>
          <p className="text-[10px] leading-snug text-text-muted">{t("focus.edit.stop-note")}</p>
        </Row>
      </div>
    </section>
  );
}

/** One reminder: a button that opens it, its switch, and when open, its editor. */
function Row({
  kind,
  name,
  detail,
  on,
  dim = false,
  open,
  onOpen,
  onToggle,
  children,
}: {
  kind: RowKind;
  name: string;
  detail: string;
  on: boolean;
  dim?: boolean;
  open: boolean;
  onOpen: () => void;
  onToggle: (on: boolean) => void;
  children: ReactNode;
}) {
  const tint = KIND_TINTS[kind];
  return (
    <div
      className={`border-t border-divider first:border-t-0 ${open ? "bg-surface-hover/60" : ""}`}
    >
      <div className="flex items-center gap-2.5 py-2 pr-3 pl-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={onOpen}
          className={`flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-[8px] px-1 text-left ${
            dim ? "opacity-60" : ""
          }`}
        >
          <span
            className="flex size-7 shrink-0 items-center justify-center rounded-full transition-colors"
            style={{
              color: on ? tint : "var(--color-text-muted)",
              background: on
                ? `color-mix(in srgb, ${tint} 16%, transparent)`
                : "var(--color-divider)",
            }}
          >
            <Icon name={KIND_ICONS[kind]} className="size-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span
              className={`block truncate text-[12px] font-semibold ${on ? "" : "text-text-secondary"}`}
            >
              {name}
            </span>
            <span className="block truncate text-[10px] text-text-muted">{detail}</span>
          </span>
          <Icon
            name={open ? "chevronDown" : "chevronRight"}
            className="size-2.5 shrink-0 text-text-muted"
          />
        </button>
        <Switch checked={on} onChange={onToggle} />
      </div>
      {open && <div className="space-y-2 pr-3 pb-3 pl-[50px]">{children}</div>}
    </div>
  );
}

function EditLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-text-secondary">{label}</span>
      {children}
    </div>
  );
}

/** How often and how long, for one interval reminder; the user's own one
 * also takes its words here. */
function IntervalEditor({
  kind,
  rule,
  snapshot,
  onSettings,
  onExample,
}: {
  kind: IntervalKind;
  rule: NextBreak;
  snapshot: FocusSnapshot;
  onSettings: (settings: FocusSettings) => void;
  onExample: (kind: BreakKind) => void;
}) {
  const { t } = useSettings();
  const { settings } = snapshot;
  const setEvery = (everyMinutes: number) =>
    onSettings({
      ...settings,
      [kind]: { ...settings[kind], everyMinutes: Math.round(everyMinutes) },
    });
  const every = (
    <NumberField
      value={String(rule.everyMinutes)}
      min={rule.minMinutes}
      max={rule.maxMinutes}
      step={1}
      unit={t(kind === "water" ? "focus.edit.water-unit" : "focus.edit.every-unit")}
      label={kindLabel(kind, settings, t)}
      onCommit={setEvery}
    />
  );
  const inMinutes = rule.minBreakSeconds >= 60;
  const scale = inMinutes ? 60 : 1;

  return (
    <>
      {kind === "custom" && <CustomName settings={settings} onSettings={onSettings} />}
      <EditLine label={t(kind === "water" ? "focus.edit.water-after" : "focus.edit.every")}>
        {every}
      </EditLine>
      {rule.breakSeconds > 0 && (
        <EditLine label={t("focus.lasts")}>
          <NumberField
            value={String(rule.breakSeconds / scale)}
            min={rule.minBreakSeconds / scale}
            max={rule.maxBreakSeconds / scale}
            step={1}
            unit={t(inMinutes ? "focus.minutes-unit" : "focus.seconds-unit")}
            label={`${kindLabel(kind, settings, t)} · ${t("focus.lasts")}`}
            onCommit={(value) =>
              onSettings({
                ...settings,
                [kind === "eyes" ? "eyesSeconds" : "moveSeconds"]: Math.round(value) * scale,
              })
            }
          />
        </EditLine>
      )}
      {kind === "water" && (
        <EditLine label={t("focus.daily-goal")}>
          <NumberField
            value={litres(settings.waterGoalMl, "latin")}
            min={snapshot.waterGoalMinMl / 1000}
            max={snapshot.waterGoalMaxMl / 1000}
            step={0.1}
            unit={t("focus.litres-unit")}
            label={t("focus.daily-goal")}
            onCommit={(value) => onSettings({ ...settings, waterGoalMl: Math.round(value * 1000) })}
          />
        </EditLine>
      )}
      {(kind !== "custom" || settings.custom.label.trim()) && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => onExample(kind)}
            className="settings-btn rounded-full px-3 text-[11px]"
          >
            {t("focus.edit.example")}
          </button>
        </div>
      )}
    </>
  );
}

/** The user's own reminder's words, saved on leaving the field so typing
 * never fires a save per key. Naming it turns it on. */
function CustomName({
  settings,
  onSettings,
}: {
  settings: FocusSettings;
  onSettings: (settings: FocusSettings) => void;
}) {
  const { t } = useSettings();
  const [draft, setDraft] = useState(settings.custom.label);
  useEffect(() => setDraft(settings.custom.label), [settings.custom.label]);

  return (
    <input
      value={draft}
      maxLength={60}
      placeholder={t("focus.custom.placeholder")}
      aria-label={t("focus.custom.title")}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const label = draft.trim();
        if (label !== settings.custom.label) {
          onSettings({
            ...settings,
            custom: { ...settings.custom, label, enabled: label.length > 0 },
          });
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      className={`${CONTROL} w-full`}
    />
  );
}
