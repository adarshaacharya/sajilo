import { Icon } from "../../../shared/components/icon";
import { WEEKDAYS_EN, WEEKDAYS_NE } from "../../../shared/components/month-grid";
import { useSettings } from "../../../shared/context/settings-context";
import type { FocusDay, FocusSnapshot } from "../../../shared/lib/ipc";
import { digits } from "../../../shared/lib/numerals";
import { STATUS_LABELS, screenTime } from "../_lib/format";

function StatusPill({ status }: { status: FocusSnapshot["status"] }) {
  const { t } = useSettings();
  const live = status === "active";
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-full border border-divider px-2 py-0.5 text-[10px] font-medium text-text-secondary">
      <span
        className={`size-1.5 rounded-full ${live ? "bg-[color:var(--color-positive)]" : "bg-text-muted"}`}
      />
      {t(STATUS_LABELS[status])}
    </span>
  );
}

/** Seven days of screen time, today last and highlighted. */
function Week({ days }: { days: readonly FocusDay[] }) {
  const { language, numerals, t } = useSettings();
  const weekdays = language === "ne" ? WEEKDAYS_NE : WEEKDAYS_EN;
  const longest = Math.max(1, ...days.map((day) => day.screenSeconds));

  return (
    <div className="flex h-14 items-end gap-1.5" role="img" aria-label={t("focus.week")}>
      {days.map((day, index) => {
        const today = index === days.length - 1;
        const weekday = new Date(`${day.date}T00:00:00`).getDay();
        return (
          <div
            key={day.date}
            className="flex min-w-0 flex-1 flex-col items-center gap-1"
            title={screenTime(day.screenSeconds, t, numerals)}
          >
            <div className="flex h-10 w-full items-end">
              {/* An empty day keeps a hairline, so the week still reads as seven. */}
              <div
                className={`w-full rounded-[3px] transition-[height] duration-500 ${
                  today ? "bg-[color:var(--color-accent-mark)]" : "bg-surface-hover"
                } ${day.screenSeconds === 0 ? "opacity-60" : ""}`}
                style={{
                  height:
                    day.screenSeconds === 0
                      ? "2px"
                      : `${Math.max(8, (day.screenSeconds / longest) * 100)}%`,
                }}
              />
            </div>
            <span
              className={`text-[9px] leading-none ${today ? "font-semibold text-text" : "text-text-muted"}`}
            >
              {weekdays[weekday]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  note,
  children,
}: {
  icon: "eye" | "walk" | "drop";
  label: string;
  value: string;
  note: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="min-w-0 flex-1 px-2 first:pl-0 last:pr-0">
      <div className="flex items-center gap-1 text-text-muted">
        <Icon name={icon} className="size-3" />
        <span className="truncate text-[10px]">{label}</span>
      </div>
      <div className="mt-1 flex items-center gap-1">
        <span className="text-[15px] font-semibold leading-none tabular-nums">{value}</span>
        {children}
      </div>
      <p className="mt-0.5 truncate text-[9px] text-text-muted">{note}</p>
    </div>
  );
}

export function TodayCard({
  snapshot,
  onWater,
}: {
  snapshot: FocusSnapshot;
  onWater: (delta: 1 | -1) => void;
}) {
  const { numerals, t } = useSettings();
  const { today, settings } = snapshot;
  const ratio = (a: number, b: number) =>
    t("focus.taken-of").replace("{n}", digits(a, numerals)).replace("{total}", digits(b, numerals));

  return (
    <section className="surface-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] text-text-muted">{t("focus.on-screen")}</p>
          <p className="mt-1 text-[26px] font-semibold leading-none tracking-[-0.01em] tabular-nums">
            {screenTime(today.screenSeconds, t, numerals)}
          </p>
        </div>
        <StatusPill status={snapshot.status} />
      </div>

      <div className="mt-3">
        <Week days={snapshot.week} />
      </div>

      <div className="mt-3 flex divide-x divide-divider border-t border-divider pt-2.5">
        <Stat
          icon="eye"
          label={t("focus.stat.eyes")}
          value={ratio(today.eyes.taken, today.eyes.reminded)}
          note={t("focus.taken-label")}
        />
        <Stat
          icon="walk"
          label={t("focus.stat.move")}
          value={ratio(today.move.taken, today.move.reminded)}
          note={t("focus.taken-label")}
        />
        <Stat
          icon="drop"
          label={t("focus.stat.water")}
          value={ratio(today.waterGlasses, settings.waterGoal)}
          note={t("focus.glasses-label")}
        >
          <span className="ml-auto flex items-center gap-0.5">
            <button
              type="button"
              aria-label={t("focus.water-remove")}
              disabled={today.waterGlasses === 0}
              onClick={() => onWater(-1)}
              className="icon-btn size-5 disabled:opacity-30"
            >
              <Icon name="minus" className="size-2.5" />
            </button>
            <button
              type="button"
              aria-label={t("focus.water-add")}
              onClick={() => onWater(1)}
              className="icon-btn size-5 text-[color:var(--color-weather-tint)]"
            >
              <Icon name="plus" className="size-3" />
            </button>
          </span>
        </Stat>
      </div>
    </section>
  );
}
