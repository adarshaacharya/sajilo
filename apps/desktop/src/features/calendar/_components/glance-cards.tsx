import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Icon } from "../../../shared/components/icon";
import { Pressable } from "../../../shared/components/motion";
import { Sparkline } from "../../../shared/components/sparkline";
import { useSettings } from "../../../shared/context/settings-context";
import { api } from "../../../shared/lib/ipc";
import { loadedValue } from "../../../shared/lib/load-state";
import type { ForexSnapshot } from "../../../types/api/ForexSnapshot";
import type { LoadState } from "../../../types/api/LoadState";
import type { WeatherLocation } from "../../../types/api/WeatherLocation";
import type { WeatherSnapshot } from "../../../types/api/WeatherSnapshot";
import { conditionTitle, formatCelsius } from "../../weather/_lib/format";

const CITY: Record<WeatherLocation, { en: string; ne: string }> = {
  kathmandu: { en: "Kathmandu", ne: "काठमाडौं" },
  pokhara: { en: "Pokhara", ne: "पोखरा" },
  lalitpur: { en: "Lalitpur", ne: "ललितपुर" },
};

function relativeFreshness(iso: string | undefined): string | null {
  if (!iso) return null;
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return "Updated just now";
  if (mins === 1) return "Updated 1 min ago";
  if (mins < 60) return `Updated ${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours === 1 ? "Updated 1 hour ago" : `Updated ${hours} hours ago`;
}

export function GlanceCards() {
  const { language, modules } = useSettings();
  const navigate = useNavigate();
  const [weather, setWeather] = useState<LoadState<WeatherSnapshot>>();
  const [forex, setForex] = useState<LoadState<ForexSnapshot>>();

  useEffect(() => {
    if (!modules.weatherEnabled) return;
    api
      .getWeather(false, modules.weatherLocation)
      .then(setWeather)
      .catch(() => {});
  }, [modules.weatherEnabled, modules.weatherLocation]);

  useEffect(() => {
    if (!modules.forexEnabled) return;
    api
      .getForex()
      .then(setForex)
      .catch(() => {});
  }, [modules.forexEnabled]);

  const weatherSnap = loadedValue(weather);
  const forexSnap = loadedValue(forex);
  const headlineCode = modules.forexFavourites[0] ?? "USD";
  const headline = forexSnap?.rates.find((rate) => rate.currencyCode === headlineCode);
  const freshness = relativeFreshness(
    weatherSnap?.freshness.fetchedAt ?? forexSnap?.freshness.fetchedAt,
  );

  if (!modules.weatherEnabled && !modules.forexEnabled) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        {modules.weatherEnabled && (
          <Pressable className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => navigate("/weather")}
              className="surface-card glance-card glance-weather relative flex min-h-[72px] w-full flex-col p-2.5 text-left"
            >
              <div className="relative z-[1] flex items-center gap-1 text-text-muted">
                <Icon name="weather" className="size-3 text-[color:var(--color-weather-tint)]" />
                <span className="text-[10px]">
                  {weatherSnap
                    ? CITY[weatherSnap.location][language]
                    : CITY[modules.weatherLocation][language]}
                </span>
              </div>
              <p className="relative z-[1] mt-0.5 text-[20px] font-semibold leading-none">
                {weatherSnap ? formatCelsius(weatherSnap.temperatureCelsius) : "…"}
              </p>
              <p className="relative z-[1] mt-1 truncate text-[10px] text-text-muted">
                {weatherSnap
                  ? `${conditionTitle(weatherSnap.condition)} · H ${formatCelsius(weatherSnap.highCelsius)} L ${formatCelsius(weatherSnap.lowCelsius)}`
                  : "—"}
              </p>
            </button>
          </Pressable>
        )}

        {modules.forexEnabled && (
          <Pressable className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => navigate("/forex")}
              className="surface-card glance-card glance-forex relative flex min-h-[72px] w-full flex-col p-2.5 text-left"
            >
              <div className="relative z-[1] flex items-center gap-1 text-text-muted">
                <Icon name="forex" className="size-3 text-[color:var(--color-forex-tint)]" />
                <span className="text-[10px]">{headlineCode} / NPR</span>
              </div>
              <p className="relative z-[1] mt-0.5 text-[20px] font-semibold leading-none">
                {headline ? headline.buy.toFixed(2) : "…"}
              </p>
              <p className="relative z-[1] mt-1 truncate text-[10px] text-text-muted">
                {headline ? `Buy · Sell ${headline.sell.toFixed(2)}` : "—"}
              </p>
              {forexSnap?.history[headlineCode] && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] px-1 pb-0.5">
                  <Sparkline values={forexSnap.history[headlineCode] ?? []} />
                </div>
              )}
            </button>
          </Pressable>
        )}
      </div>
      {freshness && <p className="px-0.5 text-[10px] text-text-muted">{freshness}</p>}
    </div>
  );
}
