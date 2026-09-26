import { type ReactNode, useState } from "react";
import { WEEKDAYS_EN, WEEKDAYS_NE } from "../../../shared/components/month-grid";
import { useSettings } from "../../../shared/context/settings-context";
import type { FocusSnapshot } from "../../../shared/lib/ipc";
import { digits } from "../../../shared/lib/numerals";
import { duration, type I18nKey, useSentenceNumerals } from "../_lib/format";

const DAY_NAMES: I18nKey[] = [
  "focus.week.day.0",
  "focus.week.day.1",
  "focus.week.day.2",
  "focus.week.day.3",
  "focus.week.day.4",
  "focus.week.day.5",
  "focus.week.day.6",
];

/** Tallest bar, in px; a day with no use keeps a sliver so the week still
 * reads as seven days. */
const BAR_HEIGHT = 40;
const EMPTY_BAR = 3;

/** One labelled number: the name on the left, the value on the right, and a
 * quieter note under the value when it needs one. */
function Row({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="min-w-0 truncate text-[12px] text-text-secondary">{label}</span>
      <span className="shrink-0 text-right">
        <span className="text-[13px] font-semibold tabular-nums">{value}</span>
        {note && <span className="ml-1.5 text-[11px] text-text-muted">{note}</span>}
      </span>
    </div>
  );
}

/**
 * The last seven days in plain rows: screen time, breaks taken, the water
 * goal, and the longest stretch without a break, plus a bar a day once there
 * is more than one day to compare. Every number is the engine's; this only
 * draws them. Nothing here leaves the computer.
 */
export function WeekCard({ snapshot }: { snapshot: FocusSnapshot }) {
  const { t, language } = useSettings();
  const numerals = useSentenceNumerals();
  const [hovered, setHovered] = useState<number | null>(null);
  const week = snapshot.summary;
  if (week.trackedDays === 0) return null;

  const several = week.trackedDays > 1;
  const letters = language === "en" ? WEEKDAYS_EN : WEEKDAYS_NE;
  const tallest = Math.max(...week.days.map((day) => day.screenSeconds), 1);
  const stretch = week.longestStretch;
  const hoveredDay = hovered === null ? undefined : week.days[hovered];

  return (
    <section className="surface-card px-3 pt-3 pb-1.5">
      <h3 className="text-[11px] font-semibold text-text-secondary">
        {t(several ? "focus.week.title" : "focus.week.title-today")}
      </h3>

      {/* A chart of one day is one bar and six blanks: it says nothing the
          row below does not, so it waits for a second day. */}
      {several && (
        <figure className="mt-2.5">
          {/* A desktop webview shows no `title` tooltips, so the hovered day
              carries its own value above the bar and names itself below. */}
          <div
            className="flex items-end gap-1.5 pt-4"
            aria-hidden="true"
            onPointerLeave={() => setHovered(null)}
          >
            {week.days.map((day, index) => {
              const height =
                day.screenSeconds > 0
                  ? Math.max(EMPTY_BAR * 2, Math.round((day.screenSeconds / tallest) * BAR_HEIGHT))
                  : EMPTY_BAR;
              const active = hovered === index;
              const idle = day.today
                ? "var(--color-accent-fill)"
                : day.screenSeconds > 0
                  ? "color-mix(in srgb, var(--color-text) 22%, transparent)"
                  : "var(--color-divider)";
              const lit = day.today
                ? "var(--color-accent-fill)"
                : "color-mix(in srgb, var(--color-text) 45%, transparent)";
              return (
                <div
                  key={day.date}
                  className="flex flex-1 flex-col items-center gap-1"
                  onPointerEnter={() => setHovered(index)}
                >
                  <div className="relative flex w-full justify-center">
                    <span
                      className={`week-bar-value ${active ? "week-bar-value--shown" : ""}`}
                      style={{ bottom: height + 3 }}
                    >
                      {duration(day.screenSeconds, numerals, t)}
                    </span>
                    <div
                      className="week-bar w-full max-w-[18px] rounded-[3px]"
                      style={{
                        height,
                        animationDelay: `${index * 35}ms`,
                        backgroundColor: active ? lit : idle,
                        opacity: hovered === null || active ? 1 : 0.45,
                      }}
                    />
                  </div>
                  <span
                    className={`text-[10px] transition-colors ${
                      day.today || active ? "font-semibold" : ""
                    } ${day.today ? "text-accent-mark" : active ? "text-text" : "text-text-muted"}`}
                  >
                    {letters[day.weekday]}
                  </span>
                </div>
              );
            })}
          </div>
          <figcaption className="mt-1 text-center text-[10px] text-text-muted">
            {t((hoveredDay && DAY_NAMES[hoveredDay.weekday]) || "focus.week.chart")}
          </figcaption>
        </figure>
      )}

      <div className="mt-1.5 divide-y divide-divider">
        {/* Today's screen time has its own tile above the card. */}
        {several && (
          <Row
            label={t("focus.week.average-row")}
            value={duration(week.averageScreenSeconds, numerals, t)}
            note={t("focus.week.average-days").replace("{n}", digits(week.trackedDays, numerals))}
          />
        )}
        {week.breaksReminded > 0 && (
          <Row
            label={t("focus.week.breaks")}
            value={t("focus.week.breaks-count")
              .replace("{taken}", digits(week.breaksTaken, numerals))
              .replace("{total}", digits(week.breaksReminded, numerals))}
          />
        )}
        {/* Today's water is already on the row above; the goal is a week's
            story, told once there are days to count. */}
        {several && snapshot.settings.water.enabled && (
          <Row
            label={t("focus.week.water")}
            value={t("focus.week.water-count")
              .replace("{met}", digits(week.waterGoalDays, numerals))
              .replace("{days}", digits(week.trackedDays, numerals))}
          />
        )}
        {stretch && (
          <Row
            label={t("focus.week.stretch-row")}
            value={duration(stretch.seconds, numerals, t)}
            note={t((!stretch.today && DAY_NAMES[stretch.weekday]) || "focus.week.today")}
          />
        )}
      </div>
      {/* Without an idle signal every minute counts, lunch included; the
          numbers above say so rather than quietly overstating. */}
      {!snapshot.idleSupported && (
        <p className="pt-1 pb-1.5 text-[11px] leading-snug text-text-muted">
          {t("focus.week.idle-unsupported")}
        </p>
      )}
    </section>
  );
}
