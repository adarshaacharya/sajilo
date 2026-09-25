import { useState } from "react";
import { Icon } from "../../../shared/components/icon";
import { Switch } from "../../../shared/components/switch";
import { TimeField } from "../../../shared/components/time-field";
import { useSettings } from "../../../shared/context/settings-context";
import type { FocusSettings, Routine } from "../../../shared/lib/ipc";
import { clock, KIND_ICONS, KIND_LABELS, KIND_TINTS, parseClock } from "../_lib/format";

const MEALS = ["breakfast", "lunch", "dinner", "bedtime"] as const;

/** Whether any meal or bedtime reminder is on. */
export function routineOn(routine: Routine): boolean {
  return MEALS.some((meal) => routine[meal].enabled);
}

/** Breakfast, lunch, dinner and bedtime: a time and a switch each. */
export function RoutineRows({
  routine,
  onChange,
}: {
  routine: Routine;
  onChange: (routine: Routine) => void;
}) {
  const { t } = useSettings();
  return (
    <div className="divide-y divide-divider">
      {MEALS.map((meal) => {
        const rule = routine[meal];
        return (
          <div key={meal} className="flex items-center gap-2.5 py-2">
            <span
              className="flex size-7 shrink-0 items-center justify-center rounded-full"
              style={{
                color: KIND_TINTS[meal],
                background: `color-mix(in srgb, ${KIND_TINTS[meal]} 14%, transparent)`,
              }}
            >
              <Icon name={KIND_ICONS[meal]} className="size-3.5" />
            </span>
            <span className="min-w-0 flex-1 truncate text-[12px]">{t(KIND_LABELS[meal])}</span>
            {/* The field is full width; the box sets its size. */}
            <div className="w-[96px] shrink-0">
              <TimeField
                value={clock(rule.at)}
                ariaLabel={t(KIND_LABELS[meal])}
                onChange={(value) => {
                  const at = parseClock(value);
                  if (at) onChange({ ...routine, [meal]: { ...rule, at } });
                }}
              />
            </div>
            <Switch
              checked={rule.enabled}
              onChange={(enabled) => onChange({ ...routine, [meal]: { ...rule, enabled } })}
            />
          </div>
        );
      })}
    </div>
  );
}

/**
 * Asked once, right after reminders are turned on: when do you eat and
 * sleep? The times start at typical ones and every meal starts on, since
 * whoever sees this has just asked to be looked after; "Not now" leaves them
 * all off, and Settings keeps them for later.
 */
export function RoutineAsk({
  settings,
  onSave,
}: {
  settings: FocusSettings;
  onSave: (settings: FocusSettings) => void;
}) {
  const { t } = useSettings();
  const [draft, setDraft] = useState<Routine>(() => ({
    breakfast: { ...settings.routine.breakfast, enabled: true },
    lunch: { ...settings.routine.lunch, enabled: true },
    dinner: { ...settings.routine.dinner, enabled: true },
    bedtime: { ...settings.routine.bedtime, enabled: true },
  }));

  return (
    <section className="surface-card p-4">
      <h2 className="text-[16px] font-semibold leading-snug">{t("focus.routine.ask-title")}</h2>
      <p className="mt-1.5 text-[12px] leading-relaxed text-text-secondary">
        {t("focus.routine.ask-body")}
      </p>
      <div className="mt-3">
        <RoutineRows routine={draft} onChange={setDraft} />
      </div>
      {/* One row, the way a dialog reads: the way out on the left, the
          main action on the right. */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onSave({ ...settings, routineAsked: true })}
          className="settings-btn w-full justify-center text-center text-[12px]"
        >
          {t("focus.routine.skip")}
        </button>
        <button
          type="button"
          onClick={() => onSave({ ...settings, routine: draft, routineAsked: true })}
          className="settings-btn settings-btn--accent w-full justify-center text-center text-[12px]"
        >
          {t("focus.routine.save")}
        </button>
      </div>
    </section>
  );
}
