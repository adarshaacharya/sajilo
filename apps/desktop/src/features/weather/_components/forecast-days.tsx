import { useState } from "react";
import { SFDropFill } from "sf-symbols-lib/monochrome/SFDropFill";
import { useSettings } from "../../../shared/context/settings-context";
import type { DailyForecast } from "../../../types/api/DailyForecast";
import { conditionTitle, forecastWeekday, formatCelsius, formatPercent } from "../_lib/format";
import { WeatherIcon } from "./weather-icon";

/**
 * The days ahead, each with a bar spanning its low to its high on one shared
 * scale, so a hot or cold day stands out before any number is read. Tapping
 * a day spells out its sky and chance of rain.
 */
export function ForecastDays({ days }: { days: DailyForecast[] }) {
  const { t, language } = useSettings();
  const [open, setOpen] = useState<string | null>(null);
  const floor = Math.min(...days.map((day) => day.lowCelsius));
  const ceiling = Math.max(...days.map((day) => day.highCelsius));
  const span = Math.max(ceiling - floor, 1);

  return (
    <section className="surface-card px-3 py-1">
      {days.map((day, index) => {
        const expanded = open === day.date;
        const left = ((day.lowCelsius - floor) / span) * 100;
        const right = ((ceiling - day.highCelsius) / span) * 100;
        return (
          <button
            key={day.date}
            type="button"
            aria-expanded={expanded}
            onClick={() => setOpen(expanded ? null : day.date)}
            className="block w-full border-b border-divider py-2 text-left last:border-b-0"
          >
            <span className="grid grid-cols-[44px_18px_30px_1fr_30px] items-center gap-1.5">
              <span className="truncate text-[12px] font-medium">
                {index === 0 ? t("weather.today") : forecastWeekday(day.date)}
              </span>
              <WeatherIcon condition={day.condition} className="size-4 text-text-secondary" />
              <span className="text-right text-[12px] text-text-muted tabular-nums">
                {formatCelsius(day.lowCelsius)}
              </span>
              <span className="relative h-[5px] rounded-full bg-[color:var(--color-divider)]">
                <span
                  className="weather-range absolute inset-y-0 rounded-full"
                  style={{ left: `${left}%`, right: `${right}%` }}
                />
              </span>
              <span className="text-[12px] font-semibold tabular-nums">
                {formatCelsius(day.highCelsius)}
              </span>
            </span>
            {expanded && (
              <span className="mt-1 flex items-center gap-2 pl-[50px] text-[11px] text-text-secondary">
                {conditionTitle(day.condition, language)}
                <span className="flex items-center gap-0.5 text-[color:var(--color-weather-tint)]">
                  <SFDropFill size={10} />
                  {t("weather.rain-chance").replace("{n}", formatPercent(day.precipitationChance))}
                </span>
              </span>
            )}
          </button>
        );
      })}
    </section>
  );
}
