import { SFDropFill } from "sf-symbols-lib/monochrome/SFDropFill";
import type { DailyForecast } from "../../../types/api/DailyForecast";
import { conditionTitle, formatCelsius } from "../_lib/format";
import { WeatherIcon } from "./weather-icon";

export function ForecastRow({ forecast, dayLabel }: { forecast: DailyForecast; dayLabel: string }) {
  return (
    <div className="row-line flex items-center gap-2 py-2">
      {dayLabel ? (
        <span className="w-9 shrink-0 text-[12px] text-text-secondary">{dayLabel}</span>
      ) : null}
      <WeatherIcon condition={forecast.condition} className="size-4 shrink-0 text-text-secondary" />
      <span className="min-w-0 flex-1 truncate text-[11px] text-text-muted">
        {conditionTitle(forecast.condition)}
      </span>
      {forecast.precipitationChance > 0 && (
        <span className="flex shrink-0 items-center gap-0.5 text-[10px] text-[color:var(--color-weather-tint)]">
          <SFDropFill size={10} />
          {forecast.precipitationChance}%
        </span>
      )}
      <span className="shrink-0 text-[12px] font-medium tabular-nums">
        {formatCelsius(forecast.highCelsius)} / {formatCelsius(forecast.lowCelsius)}
      </span>
    </div>
  );
}
