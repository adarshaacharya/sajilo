import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import { useHeaderInner, useHeaderSlot } from "../../shared/components/header-slot";
import { Icon } from "../../shared/components/icon";
import { useSettings } from "../../shared/context/settings-context";
import { api } from "../../shared/lib/ipc";
import {
  catchAsFailed,
  fetchedAtLabel,
  loadBanner,
  loadedValue,
} from "../../shared/lib/load-state";
import { placeLabel, usePlaces } from "../../shared/lib/places";
import type { WeatherSnapshot } from "../../types/api/WeatherSnapshot";
import { AirQualityPanel } from "./_components/air-quality-panel";
import { ForecastDays } from "./_components/forecast-days";
import { PinnedPlaces } from "./_components/pinned-places";
import { PlacePicker } from "./_components/place-picker";
import { WeatherAtmosphere } from "./_components/weather-atmosphere";
import { WeatherIcon } from "./_components/weather-icon";
import { aqiCategory, conditionTitle, formatCelsius, formatPercent } from "./_lib/format";
import { currentSkyPhase } from "./_lib/sky-phase";

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

export function Weather() {
  const { t, language, modules, setModules } = useSettings();
  const places = usePlaces();
  // The home place until another is picked; a place looked at from the
  // picker stays on screen without having to be pinned.
  const [picked, setPicked] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const viewing = picked ?? modules.weatherLocation;
  const {
    data: state,
    isValidating,
    mutate,
  } = useSWR(`weather:${viewing}`, () => catchAsFailed(api.getWeather(false, viewing)));
  const load = useCallback(
    (refresh = false) =>
      mutate(catchAsFailed<WeatherSnapshot>(api.getWeather(refresh, viewing)), {
        revalidate: false,
      }),
    [mutate, viewing],
  );

  const togglePin = useCallback(
    (id: string) =>
      setModules((current) => ({
        ...current,
        weatherPins: current.weatherPins.includes(id)
          ? current.weatherPins.length > 1
            ? current.weatherPins.filter((pin) => pin !== id)
            : current.weatherPins
          : [...current.weatherPins, id],
      })),
    [setModules],
  );
  const addPin = useCallback(
    (id: string) =>
      setModules((current) =>
        current.weatherPins.includes(id)
          ? current
          : { ...current, weatherPins: [...current.weatherPins, id] },
      ),
    [setModules],
  );
  const removePin = useCallback(
    (id: string) => {
      setModules((current) => ({
        ...current,
        weatherPins: current.weatherPins.filter((pin) => pin !== id),
      }));
      // Closing the tab on screen goes back to the home place.
      setPicked((shown) => (shown === id ? null : shown));
    },
    [setModules],
  );
  const makeHome = useCallback(
    (id: string) =>
      setModules((current) => ({
        ...current,
        weatherPins: [id, ...current.weatherPins.filter((pin) => pin !== id)],
      })),
    [setModules],
  );

  const loading = isValidating;

  // A reading for another place (a stale cache entry, or a recording that has
  // only the one) is never drawn under this place's name.
  const loaded = loadedValue(state);
  const snapshot = loaded?.placeId === viewing ? loaded : undefined;
  const banner = loadBanner(state, fetchedAtLabel(snapshot?.freshness));
  const phase = currentSkyPhase(snapshot?.sunrise ?? null, snapshot?.sunset ?? null);

  const refreshButton = useMemo(
    () =>
      picking ? null : (
        <button
          type="button"
          onClick={() => load(true)}
          disabled={loading}
          aria-label={t("action.refresh")}
          className="icon-btn shrink-0"
        >
          <Icon name="refresh" className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      ),
    [load, loading, picking, t],
  );
  useHeaderSlot(refreshButton);
  useHeaderInner(picking ? { title: t("weather.places"), onBack: () => setPicking(false) } : null);

  if (picking) {
    return (
      <PlacePicker
        pins={modules.weatherPins}
        onPick={(id) => {
          // Picking a place adds it as a chip: that is what "Add" promises.
          addPin(id);
          setPicked(id);
          setPicking(false);
        }}
        onTogglePin={togglePin}
      />
    );
  }

  // The place on screen, and whether it is the one the home screen shows:
  // a labelled pill, not an icon to decode.
  const isHome = viewing === modules.weatherLocation;
  const homePill = isHome ? (
    <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium opacity-75">
      <Icon name="house" className="size-3" />
      {t("weather.home-place")}
    </span>
  ) : (
    <button type="button" onClick={() => makeHome(viewing)} className="sky-btn">
      <Icon name="house" className="size-3" />
      {t("weather.make-home")}
    </button>
  );

  return (
    <div className="space-y-2.5">
      <PinnedPlaces
        pins={modules.weatherPins}
        viewing={viewing}
        onView={setPicked}
        onAdd={() => setPicking(true)}
        onRemove={removePin}
      />

      <section className="sky-card relative overflow-hidden" data-phase={phase}>
        {snapshot && <WeatherAtmosphere condition={snapshot.condition} />}
        <div className="relative z-[2] p-3.5">
          {snapshot ? (
            <>
              {banner.status === "stale" && (
                <p className="mb-1 text-[10px] opacity-75">
                  {banner.since ? `${t("state.stale-since")} ${banner.since}` : t("state.stale")}
                </p>
              )}
              <div className="flex items-start gap-3">
                <p className="text-[54px] font-bold leading-none tracking-[-0.03em]">
                  {formatCelsius(snapshot.temperatureCelsius)}
                </p>
                <div className="mt-1.5 min-w-0 space-y-0.5">
                  <p className="flex items-center gap-1.5 text-[13px] font-semibold">
                    <WeatherIcon condition={snapshot.condition} className="size-4 shrink-0" />
                    <span className="truncate">{conditionTitle(snapshot.condition, language)}</span>
                  </p>
                  <p className="text-[11px] opacity-75">
                    {t("weather.feels-like").replace(
                      "{t}",
                      formatCelsius(snapshot.apparentTemperatureCelsius),
                    )}{" "}
                    · H {formatCelsius(snapshot.highCelsius)} L {formatCelsius(snapshot.lowCelsius)}
                  </p>
                  <p className="text-[11px] opacity-75">
                    {t("weather.rain-chance").replace(
                      "{n}",
                      formatPercent(snapshot.precipitationChance),
                    )}
                  </p>
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="text-[28px] font-semibold leading-none">
                {loading ? t("state.loading") : t("state.unavailable")}
              </p>
              {/* Plain words on screen, like every other feed; the raw
                  error stays in the tooltip for bug reports. */}
              {!loading && (
                <div className="mt-2 flex items-center gap-2">
                  <p
                    className="min-w-0 flex-1 text-[11px] opacity-75"
                    title={banner.status === "failed" ? banner.message : undefined}
                  >
                    {banner.status === "failed" ? t("state.failed-hint") : t("state.not-yet")}
                  </p>
                  <button type="button" onClick={() => load(true)} className="sky-btn">
                    {t("action.retry")}
                  </button>
                </div>
              )}
            </>
          )}
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-[color:color-mix(in_srgb,currentColor_14%,transparent)] pt-2.5">
            <span className="flex min-w-0 items-center gap-1 text-[12px] font-semibold">
              <Icon name="pin" className="size-3 shrink-0 opacity-75" />
              <span className="truncate">{placeLabel(places, viewing, language)}</span>
            </span>
            {homePill}
          </div>
        </div>
      </section>

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

      {snapshot && snapshot.daily.length > 0 && (
        <section className="space-y-1.5">
          <h2 className="px-0.5 text-[11px] font-semibold text-text-secondary">
            {t("weather.next-days").replace("{n}", String(snapshot.daily.length))}
          </h2>
          <ForecastDays days={snapshot.daily} />
        </section>
      )}

      {snapshot && (
        <p className="px-0.5 text-[10px] text-text-muted">{fetchedAtLabel(snapshot.freshness)}</p>
      )}
    </div>
  );
}
