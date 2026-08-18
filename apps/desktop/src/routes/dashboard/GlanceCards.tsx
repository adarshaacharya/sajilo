import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { ICONS, Icon } from "../../components/Icon";
import { Sparkline } from "../../components/Sparkline";
import { api } from "../../lib/ipc";
import { loadedValue } from "../../lib/loadState";
import { useSettings } from "../../lib/settings";
import { conditionTitle, formatCelsius } from "../../lib/weather";
import type { ForexSnapshot } from "../../types/api/ForexSnapshot";
import type { LoadState } from "../../types/api/LoadState";
import type { WeatherLocation } from "../../types/api/WeatherLocation";
import type { WeatherSnapshot } from "../../types/api/WeatherSnapshot";

const CITY: Record<WeatherLocation, { en: string; ne: string }> = {
  kathmandu: { en: "Kathmandu", ne: "काठमाडौं" },
  pokhara: { en: "Pokhara", ne: "पोखरा" },
  lalitpur: { en: "Lalitpur", ne: "ललितपुर" },
};

const WEATHER_ICON =
  "M5 10.5a3 3 0 0 1 .4-6 4 4 0 0 1 7.5 1.2A2.5 2.5 0 0 1 12.5 11.5H5.5M6 13v1.5M8.5 13v1.5M11 13v1.5";

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
    api.getWeather(false, modules.weatherLocation).then(setWeather).catch(() => {});
  }, [modules.weatherEnabled, modules.weatherLocation]);

  useEffect(() => {
    if (!modules.forexEnabled) return;
    api.getForex().then(setForex).catch(() => {});
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
          <button
            type="button"
            onClick={() => navigate("/weather")}
            className="surface-card relative flex min-h-[72px] flex-1 flex-col overflow-hidden p-2.5 text-left hover:bg-surface-hover"
          >
            <div className="flex items-center gap-1 text-text-muted">
              <Icon path={WEATHER_ICON} className="size-3 text-[color:var(--color-accent-mark)]" />
              <span className="text-[10px]">
                {weatherSnap
                  ? CITY[weatherSnap.location][language]
                  : CITY[modules.weatherLocation][language]}
              </span>
            </div>
            <p className="mt-0.5 text-[20px] font-semibold leading-none">
              {weatherSnap ? formatCelsius(weatherSnap.temperatureCelsius) : "…"}
            </p>
            <p className="mt-1 truncate text-[10px] text-text-muted">
              {weatherSnap
                ? `${conditionTitle(weatherSnap.condition)} · H ${formatCelsius(weatherSnap.highCelsius)} L ${formatCelsius(weatherSnap.lowCelsius)}`
                : "—"}
            </p>
          </button>
        )}

        {modules.forexEnabled && (
          <button
            type="button"
            onClick={() => navigate("/forex")}
            className="surface-card relative flex min-h-[72px] flex-1 flex-col overflow-hidden p-2.5 text-left hover:bg-surface-hover"
          >
            <div className="flex items-center gap-1 text-text-muted">
              <Icon path={ICONS.gold} className="size-3" />
              <span className="text-[10px]">{headlineCode} / NPR</span>
            </div>
            <p className="mt-0.5 text-[20px] font-semibold leading-none">
              {headline ? headline.buy.toFixed(2) : "…"}
            </p>
            <p className="mt-1 truncate text-[10px] text-text-muted">
              {headline
                ? `Buy · Sell ${headline.sell.toFixed(2)}`
                : "—"}
            </p>
            {forexSnap?.history[headlineCode] && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 px-1 pb-0.5">
                <Sparkline values={forexSnap.history[headlineCode] ?? []} />
              </div>
            )}
          </button>
        )}
      </div>
      {freshness && <p className="px-0.5 text-[10px] text-text-muted">{freshness}</p>}
    </div>
  );
}
