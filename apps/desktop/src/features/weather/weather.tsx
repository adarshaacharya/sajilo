import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router";
import useSWR from "swr";
import { Icon } from "../../shared/components/icon";
import { useSettings } from "../../shared/context/settings-context";
import { api } from "../../shared/lib/ipc";
import {
  catchAsFailed,
  fetchedAtLabel,
  loadBanner,
  loadedValue,
} from "../../shared/lib/load-state";
import type { WeatherSnapshot } from "../../types/api/WeatherSnapshot";
import { AirQualityPanel } from "./_components/air-quality-panel";
import { ForecastRow } from "./_components/forecast-row";
import { WeatherAtmosphere } from "./_components/weather-atmosphere";
import { WeatherIcon } from "./_components/weather-icon";
import {
  aqiCategory,
  conditionTitle,
  forecastWeekday,
  formatCelsius,
  formatPercent,
} from "./_lib/format";
import { currentSkyPhase, skyGradient } from "./_lib/sky-phase";

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
  const {
    data: state,
    isValidating,
    mutate,
  } = useSWR(`weather:${modules.weatherLocation}`, () =>
    catchAsFailed(api.getWeather(false, modules.weatherLocation)),
  );
  const load = useCallback(
    (refresh = false) =>
      mutate(catchAsFailed<WeatherSnapshot>(api.getWeather(refresh, modules.weatherLocation)), {
        revalidate: false,
      }),
    [mutate, modules.weatherLocation],
  );

  const loading = isValidating;

  const snapshot = loadedValue(state);
  const banner = loadBanner(state, fetchedAtLabel(snapshot?.freshness));
  const phase = currentSkyPhase(snapshot?.sunrise ?? null, snapshot?.sunset ?? null);
  const tomorrow = snapshot && snapshot.daily.length > 1 ? snapshot.daily[1] : null;

  const heroToolbar = useMemo(
    () => (
      <div className="relative z-[2] flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label={t("action.back")}
          className="weather-glass-btn"
        >
          <Icon name="chevronLeft" className="size-3.5" />
        </button>
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-white">
          {snapshot ? locationLabel(snapshot.location, language) : t("feature.weather")}
        </span>
        <button
          type="button"
          onClick={() => load(true)}
          disabled={loading}
          aria-label={t("action.refresh")}
          className="weather-glass-btn"
        >
          <Icon name="refresh" className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>
    ),
    [snapshot, language, t, navigate, load, loading],
  );

  return (
    <div className="flex min-h-full flex-col">
      <section
        className="relative h-[210px] shrink-0 overflow-hidden text-white"
        style={{ background: skyGradient(phase) }}
      >
        {snapshot && <WeatherAtmosphere condition={snapshot.condition} />}
        <div className="relative z-[2] flex h-full flex-col p-2.5">
          {heroToolbar}
          <div className="mt-2 flex flex-1 flex-col justify-end">
            {snapshot ? (
              <>
                {banner.status === "stale" && (
                  <p className="mb-1 text-[10px] opacity-80">
                    {banner.since ? `${t("state.stale-since")} ${banner.since}` : t("state.stale")}
                  </p>
                )}
                <p className="text-[54px] font-semibold leading-none tracking-tight">
                  {formatCelsius(snapshot.temperatureCelsius)}
                </p>
                <div className="mt-1 flex items-center gap-1.5 text-[13px] font-medium">
                  <WeatherIcon condition={snapshot.condition} className="size-4 opacity-90" />
                  {conditionTitle(snapshot.condition)}
                </div>
                <p className="mt-0.5 text-[11px] opacity-85">
                  Feels like {formatCelsius(snapshot.apparentTemperatureCelsius)} · H{" "}
                  {formatCelsius(snapshot.highCelsius)} L {formatCelsius(snapshot.lowCelsius)} ·
                  Rain {formatPercent(snapshot.precipitationChance)}
                </p>
              </>
            ) : loading ? (
              <p className="text-[34px] font-semibold leading-none">Loading…</p>
            ) : (
              <>
                <p className="text-[34px] font-semibold leading-none">Unavailable</p>
                <p className="mt-1 text-[11px] opacity-85">
                  {banner.status === "failed" ? banner.message : t("state.not-yet")}
                </p>
                <button
                  type="button"
                  onClick={() => load(true)}
                  className="weather-glass-btn mt-2 w-auto px-2 text-[11px]"
                >
                  {t("action.retry")}
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      <div className="flex-1 space-y-2.5 p-2.5">
        {snapshot?.airQuality && (
          <AirQualityPanel
            airQuality={snapshot.airQuality}
            title={t("aqi.title")}
            categoryLabel={t(AQI_KEYS[aqiCategory(snapshot.airQuality.usAqi)])}
            advice={t(AQI_ADVICE[aqiCategory(snapshot.airQuality.usAqi)])}
            pm25Label={t("aqi.pm25")}
            pm10Label={t("aqi.pm10")}
          />
        )}

        {tomorrow && (
          <section className="surface-card p-2.5">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
              {t("weather.tomorrow")}
            </p>
            <ForecastRow forecast={tomorrow} dayLabel="" />
          </section>
        )}

        {snapshot && snapshot.daily.length > 0 && (
          <section className="surface-card p-2.5">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
              Next {snapshot.daily.length} days
            </p>
            <div>
              {snapshot.daily.map((day) => (
                <ForecastRow key={day.date} forecast={day} dayLabel={forecastWeekday(day.date)} />
              ))}
            </div>
          </section>
        )}

        {snapshot && (
          <p className="text-[10px] text-text-muted">{fetchedAtLabel(snapshot.freshness)}</p>
        )}
      </div>
    </div>
  );
}
