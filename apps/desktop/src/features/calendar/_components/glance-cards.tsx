import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Icon } from "../../../shared/components/icon";
import { Pressable } from "../../../shared/components/motion";
import { useSettings } from "../../../shared/context/settings-context";
import { api } from "../../../shared/lib/ipc";
import { loadedValue } from "../../../shared/lib/load-state";
import type { LoadState } from "../../../types/api/LoadState";
import type { StockMarketSnapshot } from "../../../types/api/StockMarketSnapshot";
import type { WeatherLocation } from "../../../types/api/WeatherLocation";
import type { WeatherSnapshot } from "../../../types/api/WeatherSnapshot";
import { money } from "../../bazar/_lib/format";
import { changeTone } from "../../bazar/_lib/stock-tone";
import { conditionTitle, formatCelsius } from "../../weather/_lib/format";

const CITY: Record<WeatherLocation, { en: string; ne: string }> = {
  kathmandu: { en: "Kathmandu", ne: "काठमाडौं" },
  pokhara: { en: "Pokhara", ne: "पोखरा" },
  lalitpur: { en: "Lalitpur", ne: "ललितपुर" },
};

function relativeFreshness(
  iso: string | undefined,
  t: (
    key:
      | "dashboard.updated-now"
      | "dashboard.updated-minute"
      | "dashboard.updated-minutes"
      | "dashboard.updated-hour"
      | "dashboard.updated-hours",
  ) => string,
): string | null {
  if (!iso) return null;
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return t("dashboard.updated-now");
  if (mins === 1) return t("dashboard.updated-minute");
  if (mins < 60) return t("dashboard.updated-minutes").replace("{n}", String(mins));
  const hours = Math.round(mins / 60);
  return hours === 1
    ? t("dashboard.updated-hour")
    : t("dashboard.updated-hours").replace("{n}", String(hours));
}

export function GlanceCards() {
  const { language, modules, t } = useSettings();
  const navigate = useNavigate();
  const [weather, setWeather] = useState<LoadState<WeatherSnapshot>>();
  const [stocks, setStocks] = useState<LoadState<StockMarketSnapshot>>();

  useEffect(() => {
    if (!modules.weatherEnabled) return;
    api
      .getWeather(false, modules.weatherLocation)
      .then(setWeather)
      .catch(() => {});
  }, [modules.weatherEnabled, modules.weatherLocation]);

  useEffect(() => {
    if (!modules.bazarEnabled) return;
    api
      .getStocks()
      .then(setStocks)
      .catch(() => {});
  }, [modules.bazarEnabled]);

  const weatherSnap = loadedValue(weather);
  const stocksSnap = loadedValue(stocks);
  const nepse = stocksSnap?.nepse ?? null;
  const freshness = relativeFreshness(
    weatherSnap?.freshness.fetchedAt ?? stocksSnap?.freshness.fetchedAt,
    t,
  );

  if (!modules.weatherEnabled && !modules.bazarEnabled) return null;

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
                  ? `${conditionTitle(weatherSnap.condition, language)} · ${t("dashboard.high")} ${formatCelsius(weatherSnap.highCelsius)} ${t("dashboard.low")} ${formatCelsius(weatherSnap.lowCelsius)}`
                  : "—"}
              </p>
            </button>
          </Pressable>
        )}

        {modules.bazarEnabled && (
          <Pressable className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => navigate("/bazar?tab=stocks")}
              className="surface-card glance-card glance-market relative flex min-h-[72px] w-full flex-col p-2.5 text-left"
            >
              <div className="relative z-[1] flex items-center gap-1 text-text-muted">
                <Icon name="interest" className="size-3 text-[color:var(--color-accent-mark)]" />
                <span className="text-[10px]">{t("dashboard.nepse")}</span>
              </div>
              <p className="relative z-[1] mt-0.5 text-[18px] font-semibold leading-none tabular-nums">
                {nepse ? money.format(nepse.value) : "…"}
              </p>
              <p
                className={`relative z-[1] mt-1 truncate text-[10px] tabular-nums ${
                  nepse && nepse.change !== 0 ? changeTone(nepse.change) : "text-text-muted"
                }`}
              >
                {nepse
                  ? nepse.change === 0
                    ? t("dashboard.nepse-no-change")
                    : `${nepse.change > 0 ? "↑" : "↓"} ${money.format(Math.abs(nepse.change))} · ${Math.abs(nepse.changePercent).toFixed(2)}%`
                  : "—"}
              </p>
            </button>
          </Pressable>
        )}
      </div>
      {freshness && <p className="px-0.5 text-[10px] text-text-muted">{freshness}</p>}
    </div>
  );
}
