import { TimeField } from "../../shared/components/time-field";
import { useSettings } from "../../shared/context/settings-context";
import type { PlanTime } from "../../shared/lib/ipc";
import { digits } from "../../shared/lib/numerals";

/** When the reading comes unless another time is picked; the shell's default. */
const DEFAULT_TIME: PlanTime = { hour: 7, minute: 0 };
/** The shell accepts 5:00 to 22:00. */
const EARLIEST_HOUR = 5;
const LATEST_HOUR = 22;

const pad = (value: number) => String(value).padStart(2, "0");

/** `at 07:00`, in the reader's digits. A missing time is the default. */
export function useReadingTimeText() {
  const { t, numerals } = useSettings();
  return (time: PlanTime | null) => {
    const { hour, minute } = time ?? DEFAULT_TIME;
    return t("rashifal.time.at").replace(
      "{time}",
      `${digits(hour, numerals, 2)}:${digits(minute, numerals, 2)}`,
    );
  };
}

/**
 * The time the daily reading comes, "Every day at 07:00", kept within 5:00
 * to 22:00 by the picker itself. One control for
 * the offer card, the Rashifal screen's own line, and Settings, so all three
 * say it the same way.
 */
export function ReadingTime({
  value,
  onChange,
}: {
  value: PlanTime | null;
  onChange: (next: PlanTime) => void;
}) {
  const { t } = useSettings();
  const { hour, minute } = value ?? DEFAULT_TIME;
  const clamp = (time: PlanTime): PlanTime =>
    time.hour < EARLIEST_HOUR
      ? { hour: EARLIEST_HOUR, minute: 0 }
      : time.hour > LATEST_HOUR || (time.hour === LATEST_HOUR && time.minute > 0)
        ? { hour: LATEST_HOUR, minute: 0 }
        : time;

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-hover px-2.5 py-1.5">
      <span className="text-[11.5px] text-text-secondary">{t("rashifal.time.every-day")}</span>
      <div className="w-[92px] shrink-0">
        <TimeField
          value={`${pad(hour)}:${pad(minute)}`}
          ariaLabel={t("rashifal.time.label")}
          onChange={(next) => {
            const [nextHour = 7, nextMinute = 0] = next.split(":").map(Number);
            onChange(clamp({ hour: nextHour, minute: nextMinute }));
          }}
        />
      </div>
    </div>
  );
}
