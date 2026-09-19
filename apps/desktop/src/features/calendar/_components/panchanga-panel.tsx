import { useState } from "react";
import { Icon } from "../../../shared/components/icon";
import { useSettings } from "../../../shared/context/settings-context";
import type { Chaughadiya, Panchanga } from "../../../shared/lib/ipc";
import { nepalClock as clockTime } from "../_lib/panchang-time";

const QUALITY: Record<Chaughadiya["quality"], string> = {
  good: "text-positive",
  neutral: "text-text-secondary",
  bad: "text-holiday",
};

/**
 * The day, or the night, in eight parts, each marked good, neutral or bad.
 * On today, the part it is now is lit, and the view opens on the half of the
 * day that holds it.
 */
function ChaughadiyaParts({
  day,
  night,
  isToday,
}: {
  day: Chaughadiya[];
  night: Chaughadiya[];
  isToday: boolean;
}) {
  const { t, language } = useSettings();
  const now = Date.now();
  const current = (part: Chaughadiya) =>
    isToday && Date.parse(part.start) <= now && now < Date.parse(part.end);
  const [showNight, setShowNight] = useState(() => isToday && night.some(current));
  const parts = showNight ? night : day;

  return (
    <div className="section-divider mt-2.5 pt-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-text-secondary">{t("panchang.chaughadiya")}</p>
        <div className="flex rounded-md bg-surface-hover p-0.5 text-[10px]" role="tablist">
          {[false, true].map((night) => (
            <button
              key={String(night)}
              type="button"
              role="tab"
              aria-selected={showNight === night}
              onClick={() => setShowNight(night)}
              className={`rounded px-2 py-0.5 ${
                showNight === night ? "bg-surface text-text shadow-sm" : "text-text-muted"
              }`}
            >
              {night ? t("panchang.night") : t("panchang.day")}
            </button>
          ))}
        </div>
      </div>
      <ol className="mt-1.5 grid grid-cols-2 gap-x-3">
        {parts.map((part) => (
          <li
            key={part.start}
            className={`flex items-baseline justify-between gap-2 rounded px-1.5 py-1 text-[11px] ${
              current(part) ? "bg-surface-hover" : ""
            }`}
          >
            <span className="tabular-nums text-text-muted">{clockTime(part.start)}</span>
            <span className={`font-medium ${QUALITY[part.quality]}`}>
              {language === "ne" ? part.name.ne : part.name.en}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function daylightText(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** Where `iso` falls between sunrise and sunset, clamped to the bar. */
function along(iso: string, start: number, span: number): number {
  return Math.min(1, Math.max(0, (new Date(iso).getTime() - start) / span));
}

/**
 * The day as a bar from sunrise to sunset, with Rahu Kaal marked on it and,
 * for today, where the day has got to. The times all come from Rust; this
 * only places them.
 */
export function PanchangaPanel({ panchanga, isToday }: { panchanga: Panchanga; isToday: boolean }) {
  const { t } = useSettings();
  const start = new Date(panchanga.sunrise).getTime();
  const span = new Date(panchanga.sunset).getTime() - start;
  const rahu =
    panchanga.rahuKaalStart && panchanga.rahuKaalEnd && span > 0
      ? {
          from: along(panchanga.rahuKaalStart, start, span),
          to: along(panchanga.rahuKaalEnd, start, span),
        }
      : null;
  const now = isToday && span > 0 ? along(new Date().toISOString(), start, span) : null;

  return (
    <section className="surface-card p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-semibold text-text-secondary">{t("panchanga.title")}</p>
        <p className="text-[10px] tabular-nums text-text-muted">
          {t("panchanga.daylight-of").replace("{time}", daylightText(panchanga.daylightSeconds))}
        </p>
      </div>

      <div
        className="day-arc relative mt-3 h-1.5 rounded-full"
        role="img"
        aria-label={`${t("panchanga.sunrise")} ${clockTime(panchanga.sunrise)}, ${t("panchanga.sunset")} ${clockTime(panchanga.sunset)}`}
      >
        {rahu && (
          <span
            className="absolute -inset-y-0.5 rounded-sm bg-holiday/85"
            style={{ left: `${rahu.from * 100}%`, width: `${(rahu.to - rahu.from) * 100}%` }}
          />
        )}
        {now !== null && (
          <span
            className="absolute -top-1 h-3.5 w-[3px] -translate-x-1/2 rounded-full bg-text shadow-[0_0_0_2px_var(--color-surface)]"
            style={{ left: `${now * 100}%` }}
          />
        )}
      </div>

      <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-text-secondary">
        <span className="flex items-center gap-1">
          <Icon name="sunrise" className="size-3 opacity-70" />
          {clockTime(panchanga.sunrise)}
        </span>
        <span className="flex items-center gap-1">
          {clockTime(panchanga.sunset)}
          <Icon name="sunset" className="size-3 opacity-70" />
        </span>
      </div>

      {panchanga.rahuKaalStart && panchanga.rahuKaalEnd && (
        <div className="mt-2.5 flex items-start gap-2">
          <span className="mt-[3px] size-2.5 shrink-0 rounded-[3px] bg-holiday/85" />
          <div className="min-w-0">
            <p className="text-[12px] tabular-nums">
              {t("panchanga.rahu-kaal")} {clockTime(panchanga.rahuKaalStart)}–
              {clockTime(panchanga.rahuKaalEnd)}
            </p>
            <p className="mt-0.5 text-[10px] leading-snug text-text-muted">
              {t("panchanga.rahu-note")} {t("panchanga.computed")}
            </p>
          </div>
        </div>
      )}
      {panchanga.chaughadiyaDay?.length === 8 && panchanga.chaughadiyaNight?.length === 8 && (
        <ChaughadiyaParts
          day={panchanga.chaughadiyaDay}
          night={panchanga.chaughadiyaNight}
          isToday={isToday}
        />
      )}
    </section>
  );
}
