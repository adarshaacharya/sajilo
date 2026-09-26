import type { ReactNode } from "react";
import { BackButton } from "../../../shared/components/back-button";
import { WEEKDAYS_NE } from "../../../shared/components/month-grid";
import { Segmented } from "../../../shared/components/segmented";
import { Toggle } from "../../../shared/components/toggle";
import { useSettings } from "../../../shared/context/settings-context";
import {
  api,
  type BreakKind,
  type DaysOff,
  type FocusSettings,
  type FocusSnapshot,
  type HoldRules,
  type ReminderStyle,
} from "../../../shared/lib/ipc";
import { type I18nKey, kindLabel, type TFn } from "../_lib/format";

const DAYS_EN = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

/** Most to least, so the list reads as a scale; the gentle one is marked. */
const DAYS_OFF: { id: DaysOff; label: I18nKey }[] = [
  { id: "normal", label: "focus.days.option.normal" },
  { id: "lighter", label: "focus.days.option.lighter" },
  { id: "off", label: "focus.days.option.off" },
];

/** What each choice keeps on a day off, mirroring the engine's rule: a
 * lighter day drops only standing up, and stop-work rests on every day off. */
const ON_A_DAY_OFF: { kind: BreakKind; in: DaysOff[] }[] = [
  { kind: "eyes", in: ["normal", "lighter"] },
  { kind: "water", in: ["normal", "lighter"] },
  { kind: "custom", in: ["normal", "lighter"] },
  { kind: "move", in: ["normal"] },
  { kind: "endOfDay", in: [] },
];

const PLURAL_DAYS = [
  "focus.days.plural.0",
  "focus.days.plural.1",
  "focus.days.plural.2",
  "focus.days.plural.3",
  "focus.days.plural.4",
  "focus.days.plural.5",
  "focus.days.plural.6",
] as const satisfies readonly I18nKey[];

/** "Saturdays", "Fridays and Saturdays", "Fridays, Saturdays and Sundays". */
function daysOffNames(workDays: readonly boolean[], t: TFn): string {
  const names = PLURAL_DAYS.filter((_, day) => !workDays[day]).map((key) => t(key));
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")}${t("focus.days.and")}${names.at(-1)}`;
}

const HOLDS: { id: keyof HoldRules; label: I18nKey; note: I18nKey }[] = [
  { id: "calls", label: "focus.hold.calls", note: "focus.hold.calls-note" },
  { id: "fullscreen", label: "focus.hold.fullscreen", note: "focus.hold.fullscreen-note" },
  { id: "doNotDisturb", label: "focus.hold.dnd", note: "focus.hold.dnd-note" },
];

function Group({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="surface-card space-y-3 p-3">
      <div>
        <h3 className="text-[11px] font-semibold text-text-secondary">{title}</h3>
        {note && <p className="mt-0.5 text-[10px] leading-snug text-text-muted">{note}</p>}
      </div>
      {children}
    </section>
  );
}

/**
 * The few choices that are not about one reminder: which moments hold a
 * break, what a day off does, and how a reminder arrives — and the way to
 * turn it all off. Each reminder's own numbers live on its row.
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
  const { t, language } = useSettings();
  const { settings, holdSupport } = snapshot;
  const weekdays = language === "ne" ? WEEKDAYS_NE : DAYS_EN;
  const offNames = daysOffNames(settings.workDays, t);

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

      <Group title={t("focus.hold.title")} note={t("focus.hold.note")}>
        {/* A switch this computer could never act on is left out. */}
        {HOLDS.filter((hold) => holdSupport[hold.id]).map((hold) => (
          <Toggle
            key={hold.id}
            label={t(hold.label)}
            note={t(hold.note)}
            checked={settings.hold[hold.id]}
            onChange={(on) =>
              onSettings({ ...settings, hold: { ...settings.hold, [hold.id]: on } })
            }
          />
        ))}
        {/* The safety net, said out loud: otherwise breaks that stopped
            waiting look like the switch is broken. */}
        {settings.hold.calls && snapshot.callIgnored && (
          <p className="text-[10px] leading-snug text-[color:var(--color-holiday)]">
            {t("focus.hold.calls-stuck")}
          </p>
        )}
      </Group>

      <Group title={t("focus.days.title")}>
        <div>
          <p className="mb-1.5 text-[10px] font-medium text-text-muted">{t("focus.days")}</p>
          <div className="grid grid-cols-7 gap-1">
            {weekdays.map((label, index) => {
              const on = settings.workDays[index] ?? false;
              return (
                <button
                  // biome-ignore lint/suspicious/noArrayIndexKey: the seven weekdays never reorder
                  key={index}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    onSettings({
                      ...settings,
                      workDays: settings.workDays.map((day, i) => (i === index ? !day : day)),
                    })
                  }
                  className={`day-chip ${on ? "day-chip--on" : ""}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="space-y-2 border-t border-divider pt-2.5">
          {/* Named days, not "days off": the user just picked them above. */}
          <p className="text-[11px] font-medium text-text-secondary">
            {offNames
              ? t("focus.days.mode-named").replace("{days}", offNames)
              : t("focus.days.mode-holidays")}
          </p>
          <fieldset className="space-y-1">
            <legend className="sr-only">{t("focus.days.title")}</legend>
            {DAYS_OFF.map((option) => {
              const on = option.id === settings.daysOff;
              return (
                <label
                  key={option.id}
                  className={`days-off-option ${on ? "days-off-option--on" : ""}`}
                >
                  <input
                    type="radio"
                    name="focus-days-off"
                    className="sr-only"
                    checked={on}
                    onChange={() => onSettings({ ...settings, daysOff: option.id })}
                  />
                  <span className="days-off-option__dot" aria-hidden="true" />
                  <span className="min-w-0 flex-1 text-left">{t(option.label)}</span>
                  {option.id === "lighter" && (
                    <span className="text-[10px] text-text-muted">
                      {t("focus.days.recommended")}
                    </span>
                  )}
                </label>
              );
            })}
          </fieldset>
          {/* What the chosen option means, as a list to scan rather than a
              sentence to decode. */}
          <div className="rounded-[8px] bg-[color:var(--color-surface-hover)] px-2.5 py-2">
            <p className="text-[10px] font-medium text-text-muted">{t("focus.days.you-get")}</p>
            <ul className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5">
              {ON_A_DAY_OFF.map((item) => {
                const kept = item.in.includes(settings.daysOff);
                return (
                  <li
                    key={item.kind}
                    className={`flex items-center gap-1.5 text-[11px] ${kept ? "text-text" : "text-text-muted line-through"}`}
                  >
                    <span
                      aria-hidden="true"
                      className={kept ? "text-[color:var(--color-positive)]" : "text-text-muted"}
                    >
                      {kept ? "✓" : "✕"}
                    </span>
                    <span className="truncate">{kindLabel(item.kind, settings, t)}</span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-1.5 text-[10px] leading-snug text-text-muted">
              {t("focus.days.meals")}
            </p>
          </div>
          <p className="text-[10px] leading-snug text-text-muted">
            {t("focus.days.holidays-note")}
          </p>
        </div>
      </Group>

      <Group title={t("focus.style")} note={t("focus.style-shared")}>
        <Segmented<ReminderStyle>
          label={t("focus.style")}
          value={settings.style}
          onChange={(style) => setStyle(style)}
          options={[
            { id: "card", label: t("reminders.style.card") },
            { id: "notification", label: t("focus.style.notification") },
          ]}
        />
        <p className="-mt-1.5 text-[10px] leading-snug text-text-muted">
          {t(settings.style === "card" ? "focus.style-note.card" : "focus.style-note.notification")}
        </p>
        <div className="space-y-2.5 border-t border-divider pt-2.5">
          <Toggle
            label={t("focus.jokes")}
            note={t("focus.jokes-note")}
            checked={settings.jokes}
            onChange={(jokes) => onSettings({ ...settings, jokes })}
          />
          <Toggle
            label={t("focus.chime")}
            checked={settings.chime}
            onChange={(chime) => onSettings({ ...settings, chime })}
          />
        </div>
      </Group>

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
