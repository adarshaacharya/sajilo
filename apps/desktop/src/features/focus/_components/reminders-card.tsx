import { Icon } from "../../../shared/components/icon";
import { Select } from "../../../shared/components/select";
import { Switch } from "../../../shared/components/switch";
import { useSettings } from "../../../shared/context/settings-context";
import type {
  BreakKind,
  FocusSettings,
  FocusSnapshot,
  NextBreak,
  PauseChoice,
} from "../../../shared/lib/ipc";
import { digits } from "../../../shared/lib/numerals";
import { KIND_ICONS, KIND_LABELS, KIND_NOTES } from "../_lib/format";

const WATER_GOALS = [4, 6, 8, 10, 12];
const PAUSES: readonly Exclude<PauseChoice, "resume">[] = ["halfHour", "hour", "restOfDay"];

const KIND_TINTS: Record<BreakKind, string> = {
  eyes: "var(--color-accent-mark)",
  move: "var(--color-positive)",
  water: "var(--color-weather-tint)",
};

function BreakRow({
  item,
  onChange,
}: {
  item: NextBreak;
  onChange: (rule: { enabled: boolean; everyMinutes: number }) => void;
}) {
  const { numerals, t } = useSettings();
  // The interval sits in the dropdown beside it; the line under the name says
  // what that means right now.
  const detail =
    item.enabled && item.minutesLeft !== null
      ? t("focus.next-in").replace("{n}", digits(item.minutesLeft, numerals))
      : t(KIND_NOTES[item.kind]);

  return (
    <div className="flex items-center gap-2.5 py-2.5">
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-full"
        style={{
          color: KIND_TINTS[item.kind],
          background: `color-mix(in srgb, ${KIND_TINTS[item.kind]} 14%, transparent)`,
        }}
      >
        <Icon name={KIND_ICONS[item.kind]} className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-medium">{t(KIND_LABELS[item.kind])}</p>
        <p className="mt-0.5 truncate text-[10px] text-text-muted">{detail}</p>
      </div>
      {item.enabled && (
        <div className="w-[76px] shrink-0">
          <Select
            ariaLabel={t(KIND_LABELS[item.kind])}
            value={String(item.everyMinutes)}
            onChange={(value) => onChange({ enabled: true, everyMinutes: Number(value) })}
            options={item.choices.map((minutes) => ({
              id: String(minutes),
              label: t("focus.minutes-option").replace("{n}", digits(minutes, numerals)),
            }))}
          />
        </div>
      )}
      <Switch
        checked={item.enabled}
        onChange={(enabled) => onChange({ enabled, everyMinutes: item.everyMinutes })}
      />
    </div>
  );
}

function PauseBar({
  pausedUntil,
  onPause,
}: {
  pausedUntil: string | null;
  onPause: (choice: PauseChoice) => void;
}) {
  const { t } = useSettings();

  if (pausedUntil) {
    const time = new Date(pausedUntil).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
    return (
      <div className="flex items-center justify-between gap-2 border-t border-divider pt-2.5">
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-text-secondary">
          <Icon name="pause" className="size-2.5" />
          <span className="truncate">{t("focus.paused-until").replace("{time}", time)}</span>
        </span>
        <button
          type="button"
          onClick={() => onPause("resume")}
          className="settings-btn text-[11px]"
        >
          {t("focus.resume")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 border-t border-divider pt-2.5">
      <span className="mr-auto text-[11px] text-text-secondary">{t("focus.pause")}</span>
      {PAUSES.map((choice) => (
        <button
          key={choice}
          type="button"
          onClick={() => onPause(choice)}
          className="toggle-chip toggle-chip--off min-w-0 px-2 py-[3px] text-[10px]"
        >
          {t(`focus.pause.${choice}`)}
        </button>
      ))}
    </div>
  );
}

export function RemindersCard({
  snapshot,
  onSettings,
  onPause,
}: {
  snapshot: FocusSnapshot;
  onSettings: (settings: FocusSettings) => void;
  onPause: (choice: PauseChoice) => void;
}) {
  const { numerals, t } = useSettings();
  const { settings } = snapshot;

  return (
    <section className="surface-card px-3 pt-1 pb-2">
      <h2 className="pt-2 text-[11px] font-semibold text-text-secondary">{t("focus.reminders")}</h2>
      <div className="divide-y divide-divider">
        {snapshot.breaks.map((item) => (
          <BreakRow
            key={item.kind}
            item={item}
            onChange={(rule) => onSettings({ ...settings, [item.kind]: rule })}
          />
        ))}
      </div>

      {settings.water.enabled && (
        <div className="flex items-center justify-between gap-2 border-t border-divider py-2">
          <span className="text-[11px] text-text-secondary">{t("focus.daily-goal")}</span>
          <div className="w-[104px]">
            <Select
              ariaLabel={t("focus.daily-goal")}
              value={String(settings.waterGoal)}
              onChange={(value) => onSettings({ ...settings, waterGoal: Number(value) })}
              options={WATER_GOALS.map((goal) => ({
                id: String(goal),
                label: t("focus.glasses-option").replace("{n}", digits(goal, numerals)),
              }))}
            />
          </div>
        </div>
      )}

      {settings.eyes.enabled || settings.move.enabled || settings.water.enabled ? (
        <PauseBar pausedUntil={snapshot.pausedUntil} onPause={onPause} />
      ) : null}
    </section>
  );
}
