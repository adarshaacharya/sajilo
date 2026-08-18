import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Card } from "../components/Card";
import { StateBanner } from "../components/StateBanner";
import { api } from "../lib/ipc";
import { fetchedAtLabel, loadBanner, loadedValue } from "../lib/loadState";
import { useSettings } from "../lib/settings";
import { conditionTitle, aqiCategory, formatCelsius, formatPercent } from "../lib/weather";
import type { LoadState } from "../types/api/LoadState";
import type { WeatherSnapshot } from "../types/api/WeatherSnapshot";

const AQI_KEYS = {
  good: "aqi.good",
  moderate: "aqi.moderate",
  unhealthyForSensitive: "aqi.sensitive",
  unhealthy: "aqi.unhealthy",
  veryUnhealthy: "aqi.very-unhealthy",
  hazardous: "aqi.hazardous",
} as const;

const AQI_ADVICE = {
  good: "aqi.advice.good",
  moderate: "aqi.advice.moderate",
  unhealthyForSensitive: "aqi.advice.sensitive",
  unhealthy: "aqi.advice.unhealthy",
  veryUnhealthy: "aqi.advice.very-unhealthy",
  hazardous: "aqi.advice.hazardous",
} as const;

function locationLabel(location: WeatherSnapshot["location"], language: "en" | "ne"): string {
  const names: Record<WeatherSnapshot["location"], { en: string; ne: string }> = {
    kathmandu: { en: "Kathmandu", ne: "काठमाडौं" },
    pokhara: { en: "Pokhara", ne: "पोखरा" },
    lalitpur: { en: "Lalitpur", ne: "ललितपुर" },
  };
  return names[location]?.[language] ?? location;
}

export function Weather() {
  const { t, language, modules } = useSettings();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState<WeatherSnapshot>>();

  const load = useCallback(
    (refresh = false) => {
      setState(undefined);
      api
        .getWeather(refresh, modules.weatherLocation)
        .then(setState)
        .catch((error: unknown) => setState({ status: "failed", value: String(error) }));
    },
    [modules.weatherLocation],
  );

  useEffect(() => load(), [load]);

  const snapshot = loadedValue(state);
  const banner = loadBanner(state, fetchedAtLabel(snapshot?.freshness));

  return (
    <div className="space-y-3">
      <Card>
        <div className="weather-hero rounded-2xl p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">
              {snapshot ? locationLabel(snapshot.location, language) : t("feature.weather")}
            </p>
            <button
              type="button"
              onClick={() => load(true)}
              className="rounded px-2 py-0.5 text-[11px] text-text-secondary hover:bg-surface-hover"
            >
              {t("action.refresh")}
            </button>
          </div>
          <StateBanner state={banner} onRetry={() => load(true)}>
            {snapshot && (
              <>
                <p className="text-4xl font-semibold leading-none">
                  {formatCelsius(snapshot.temperatureCelsius)}
                </p>
                <p className="mt-1 text-text-secondary">{conditionTitle(snapshot.condition)}</p>
                <p className="mt-0.5 text-[11px] text-text-muted">
                  Feels like {formatCelsius(snapshot.apparentTemperatureCelsius)} ·{" "}
                  {formatCelsius(snapshot.lowCelsius)} / {formatCelsius(snapshot.highCelsius)} ·{" "}
                  {formatPercent(snapshot.precipitationChance)} rain
                </p>
              </>
            )}
          </StateBanner>
        </div>
      </Card>

      {snapshot?.airQuality && (() => {
        const category = aqiCategory(snapshot.airQuality.usAqi);
        return (
        <Card title={t("aqi.title")}>
          <p className="font-semibold">
            {t(AQI_KEYS[category])} · {snapshot.airQuality.usAqi}
          </p>
          <p className="mt-1 text-[11px] text-text-muted">
            {t("aqi.pm25")} {snapshot.airQuality.pm25.toFixed(1)} · {t("aqi.pm10")}{" "}
            {snapshot.airQuality.pm10.toFixed(1)}
          </p>
          <p className="mt-1.5 text-text-secondary">{t(AQI_ADVICE[category])}</p>
        </Card>
        );
      })()}

      {snapshot && snapshot.daily.length > 1 && (
        <Card title="Forecast">
          <ul className="divide-y divide-border">
            {snapshot.daily.slice(1).map((day) => (
              <li key={day.date} className="flex items-center justify-between gap-2 py-1.5">
                <span className="text-text-secondary">
                  {day.date === snapshot.daily[1]?.date ? t("weather.tomorrow") : day.date}
                </span>
                <span className="text-[11px] text-text-muted">{conditionTitle(day.condition)}</span>
                <span className="shrink-0 font-medium">
                  {formatCelsius(day.highCelsius)} / {formatCelsius(day.lowCelsius)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <button
        type="button"
        onClick={() => navigate("/")}
        className="w-full rounded-xl border border-border py-1.5 text-text-secondary hover:bg-surface-hover"
      >
        {t("action.back")}
      </button>
    </div>
  );
}
