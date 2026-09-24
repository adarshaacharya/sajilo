import { useEffect, useState } from "react";
import { BackButton } from "../../../shared/components/back-button";
import { CONTROL } from "../../../shared/components/control";
import { Segmented } from "../../../shared/components/segmented";
import { Switch } from "../../../shared/components/switch";
import { useSettings } from "../../../shared/context/settings-context";
import {
  api,
  type FocusSettings,
  type FocusSnapshot,
  type NextBreak,
  type ReminderStyle,
} from "../../../shared/lib/ipc";
import { litres } from "../_lib/format";
import { RoutineRows } from "./routine";
import { ScheduleCard } from "./schedule-card";

const OFTEN_LABELS = {
  eyes: "focus.row.eyes",
  move: "focus.row.move",
  water: "focus.row.water",
} as const;

/**
 * A number typed freely, saved when the field is left (or on Enter) rather
 * than on every key. The engine keeps it within range, and the field then
 * shows what was kept, so an out-of-range entry visibly snaps to the limit.
 */
function NumberField({
  value,
  min,
  max,
  step,
  unit,
  label,
  onCommit,
}: {
  /** As shown in the field, in Latin digits: inputs take no other. */
  value: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  label: string;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const commit = () => {
    const typed = Number.parseFloat(draft.replace(",", "."));
    if (Number.isFinite(typed) && typed > 0) onCommit(typed);
    else setDraft(value);
  };

  return (
    <span className="flex items-center gap-1.5">
      <input
        type="number"
        inputMode={step < 1 ? "decimal" : "numeric"}
        step={step}
        min={min}
        max={max}
        value={draft}
        aria-label={label}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        className={`${CONTROL} w-[52px] text-right tabular-nums`}
      />
      <span className="min-w-6 text-[11px] text-text-secondary">{unit}</span>
    </span>
  );
}

/** "Every [20] min" for one kind of break. */
function Every({
  item,
  label,
  onCommit,
}: {
  item: NextBreak;
  label: string;
  onCommit: (minutes: number) => void;
}) {
  const { t } = useSettings();
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-[11px] text-text-secondary">{t("focus.every")}</span>
      <NumberField
        value={String(item.everyMinutes)}
        min={item.minMinutes}
        max={item.maxMinutes}
        step={1}
        unit={t("focus.minutes-unit")}
        label={label}
        onCommit={(minutes) => onCommit(Math.round(minutes))}
      />
    </span>
  );
}

/** "[20] sec" or "[2] min": how long a break's countdown runs. A look away
 * is set in seconds, a walk in minutes. */
function Lasts({
  item,
  label,
  onCommit,
}: {
  item: NextBreak;
  label: string;
  onCommit: (seconds: number) => void;
}) {
  const { t } = useSettings();
  const inMinutes = item.minBreakSeconds >= 60;
  const scale = inMinutes ? 60 : 1;
  return (
    <NumberField
      value={String(item.breakSeconds / scale)}
      min={item.minBreakSeconds / scale}
      max={item.maxBreakSeconds / scale}
      step={1}
      unit={t(inMinutes ? "focus.minutes-unit" : "focus.seconds-unit")}
      label={label}
      onCommit={(value) => onCommit(Math.round(value) * scale)}
    />
  );
}

/** The user's own reminder: their words, their interval, on or off. The
 * label is saved on leaving the field, so typing never fires a save per key. */
function CustomReminder({
  snapshot,
  onSettings,
}: {
  snapshot: FocusSnapshot;
  onSettings: (settings: FocusSettings) => void;
}) {
  const { t } = useSettings();
  const { settings } = snapshot;
  const [draft, setDraft] = useState(settings.custom.label);
  useEffect(() => setDraft(settings.custom.label), [settings.custom.label]);
  const item = snapshot.breaks.find((each) => each.kind === "custom");
  const save = (custom: Partial<FocusSettings["custom"]>) =>
    onSettings({ ...settings, custom: { ...settings.custom, ...custom } });

  return (
    <section className="surface-card space-y-2.5 p-3">
      <div>
        <h3 className="text-[11px] font-semibold text-text-secondary">{t("focus.custom.title")}</h3>
        <p className="mt-0.5 text-[10px] text-text-muted">{t("focus.custom.note")}</p>
      </div>
      <input
        value={draft}
        maxLength={60}
        placeholder={t("focus.custom.placeholder")}
        aria-label={t("focus.custom.title")}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const label = draft.trim();
          // Naming it is the intent to be reminded; clearing it is not.
          if (label !== settings.custom.label) save({ label, enabled: label.length > 0 });
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        className={`${CONTROL} w-full`}
      />
      <div className="flex items-center justify-between gap-2">
        {item && (
          <Every
            item={item}
            label={t("focus.custom.title")}
            onCommit={(everyMinutes) => save({ everyMinutes })}
          />
        )}
        <span className="flex items-center gap-2 text-[12px]">
          {t("focus.custom.on")}
          <Switch
            checked={settings.custom.enabled && settings.custom.label.trim().length > 0}
            onChange={(enabled) => save({ enabled })}
          />
        </span>
      </div>
    </section>
  );
}

/**
 * Everything that is not "what's next": how often, the water goal, the
 * user's own reminder, work hours, how a reminder arrives — and the way to
 * turn it all off. Kept off the main view so the tab reads at a glance.
 */
export function SettingsPanel({
  snapshot,
  onSettings,
  onTurnOff,
  onBack,
}: {
  snapshot: FocusSnapshot;
  onSettings: (settings: FocusSettings) => void;
  onTurnOff: () => void;
  onBack: () => void;
}) {
  const { t } = useSettings();
  const { settings } = snapshot;

  // One choice for every Sajilo reminder, kept with the others in Settings;
  // Routine shows it here too, since this is where people look for it.
  const setStyle = async (style: ReminderStyle) => {
    const options = await api.getNotificationOptions().catch(() => null);
    if (!options) return;
    await api.setNotificationOptions({ ...options, style }).catch(() => {});
    onSettings({ ...settings, style });
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2 px-0.5">
        <BackButton onClick={onBack} />
        <h2 className="text-[13px] font-semibold">{t("focus.settings")}</h2>
      </div>

      <section className="surface-card space-y-2.5 p-3">
        <h3 className="text-[11px] font-semibold text-text-secondary">
          {t("focus.settings.often")}
        </h3>
        {/* A small table: one row per break, "every" and "lasts" in columns,
            so each field sits under the same heading as its neighbours. */}
        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 gap-y-2">
          <span />
          <span className="text-[10px] text-text-muted">{t("focus.every")}</span>
          <span className="text-[10px] text-text-muted">{t("focus.lasts")}</span>
          {snapshot.breaks.flatMap((item) => {
            if (item.kind !== "eyes" && item.kind !== "move" && item.kind !== "water") return [];
            const kind = item.kind;
            const label = t(OFTEN_LABELS[kind]);
            return [
              <span key={`${kind}.label`} className="truncate text-[12px]">
                {label}
              </span>,
              <NumberField
                key={`${kind}.every`}
                value={String(item.everyMinutes)}
                min={item.minMinutes}
                max={item.maxMinutes}
                step={1}
                unit={t("focus.minutes-unit")}
                label={label}
                onCommit={(minutes) =>
                  onSettings({
                    ...settings,
                    [kind]: { ...settings[kind], everyMinutes: Math.round(minutes) },
                  })
                }
              />,
              item.breakSeconds > 0 ? (
                <Lasts
                  key={`${kind}.lasts`}
                  item={item}
                  label={`${label} · ${t("focus.lasts")}`}
                  onCommit={(seconds) =>
                    onSettings({
                      ...settings,
                      [kind === "eyes" ? "eyesSeconds" : "moveSeconds"]: seconds,
                    })
                  }
                />
              ) : (
                <span key={`${kind}.lasts`} />
              ),
            ];
          })}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-divider pt-2.5">
          <span className="text-[12px]">{t("focus.daily-goal")}</span>
          <NumberField
            value={litres(settings.waterGoalMl, "latin")}
            min={snapshot.waterGoalMinMl / 1000}
            max={snapshot.waterGoalMaxMl / 1000}
            step={0.1}
            unit={t("focus.litres-unit")}
            label={t("focus.daily-goal")}
            onCommit={(value) => onSettings({ ...settings, waterGoalMl: Math.round(value * 1000) })}
          />
        </div>
      </section>

      <section className="surface-card px-3 pt-3 pb-1">
        <h3 className="text-[11px] font-semibold text-text-secondary">
          {t("focus.routine.title")}
        </h3>
        <p className="mt-0.5 text-[10px] text-text-muted">{t("focus.routine.note")}</p>
        <RoutineRows
          routine={settings.routine}
          onChange={(routine) => onSettings({ ...settings, routine })}
        />
      </section>

      <CustomReminder snapshot={snapshot} onSettings={onSettings} />

      <ScheduleCard settings={settings} onSettings={onSettings} />

      <section className="surface-card space-y-2 p-3">
        <h3 className="text-[11px] font-semibold text-text-secondary">{t("focus.style")}</h3>
        <Segmented<ReminderStyle>
          label={t("focus.style")}
          value={settings.style}
          onChange={(style) => setStyle(style)}
          options={[
            { id: "card", label: t("reminders.style.card") },
            { id: "notification", label: t("focus.style.notification") },
          ]}
        />
        <p className="text-[10px] leading-snug text-text-muted">
          {t(settings.style === "card" ? "focus.style-note.card" : "focus.style-note.notification")}
        </p>
        <div className="border-t border-divider pt-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px]">{t("focus.jokes")}</span>
            <Switch
              checked={settings.jokes}
              onChange={(jokes) => onSettings({ ...settings, jokes })}
            />
          </div>
          <p className="mt-0.5 text-[10px] leading-snug text-text-muted">{t("focus.jokes-note")}</p>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-divider pt-2">
          <span className="text-[12px]">{t("focus.chime")}</span>
          <Switch
            checked={settings.chime}
            onChange={(chime) => onSettings({ ...settings, chime })}
          />
        </div>
      </section>

      <div className="px-0.5 pb-1">
        <button
          type="button"
          onClick={onTurnOff}
          className="settings-btn w-full justify-center text-center text-[12px]"
          // `.settings-btn` sets its own ink; this one is the red of undoing.
          style={{ color: "var(--color-holiday)" }}
        >
          {t("focus.turn-off")}
        </button>
        <p className="mt-1.5 text-center text-[10px] leading-snug text-text-muted">
          {t("focus.turn-off-note")}
        </p>
      </div>
    </div>
  );
}
