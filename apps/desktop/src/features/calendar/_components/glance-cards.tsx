import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Icon } from "../../../shared/components/icon";
import { Pressable } from "../../../shared/components/motion";
import { SkeletonBlock } from "../../../shared/components/skeleton";
import { useSettings } from "../../../shared/context/settings-context";
import { relativeFreshness } from "../../../shared/lib/freshness";
import { api } from "../../../shared/lib/ipc";
import { loadedValue } from "../../../shared/lib/load-state";
import { placeLabel, usePlaces } from "../../../shared/lib/places";
import type { ForexSnapshot } from "../../../types/api/ForexSnapshot";
import type { LoadState } from "../../../types/api/LoadState";
import type { StockMarketSnapshot } from "../../../types/api/StockMarketSnapshot";
import type { WeatherSnapshot } from "../../../types/api/WeatherSnapshot";
import { money } from "../../bazar/_lib/format";
import { LIVE_REFRESH_MS } from "../../bazar/_lib/live";
import { changeTone } from "../../bazar/_lib/stock-tone";
import { conditionTitle, formatCelsius } from "../../weather/_lib/format";

/** Rates that fit one line of the popover beside their codes. */
const FOREX_ON_TODAY = 3;

export function GlanceCards() {
  const { language, modules, setModules, t } = useSettings();
  const navigate = useNavigate();
  const places = usePlaces();
  const [weather, setWeather] = useState<LoadState<WeatherSnapshot>>();
  const [stocks, setStocks] = useState<LoadState<StockMarketSnapshot>>();
  const [forex, setForex] = useState<LoadState<ForexSnapshot>>();
  const showNepse = modules.bazarEnabled && modules.nepseCardEnabled;

  useEffect(() => {
    if (!modules.forexEnabled) return;
    api
      .getForex(false)
      .then(setForex)
      .catch(() => {});
  }, [modules.forexEnabled]);

  useEffect(() => {
    if (!modules.weatherEnabled) return;
    api
      .getWeather(false, modules.weatherLocation)
      .then(setWeather)
      .catch(() => {});
  }, [modules.weatherEnabled, modules.weatherLocation]);

  const marketOpen = loadedValue(stocks)?.marketStatus?.isOpen ?? false;
  useEffect(() => {
    if (!showNepse) return;
    const load = () =>
      api
        .getStocks()
        .then(setStocks)
        .catch(() => {});
    load();
    // Follow the index while the exchange trades; once it closes the number
    // stays put, so there is nothing to poll for.
    if (!marketOpen) return;
    const timer = window.setInterval(load, LIVE_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [showNepse, marketOpen]);

  // A reading for another place (the home place just changed) is not drawn
  // under this one's name.
  const weatherLoaded = loadedValue(weather);
  const weatherSnap =
    weatherLoaded?.placeId === modules.weatherLocation ? weatherLoaded : undefined;
  const stocksSnap = loadedValue(stocks);
  const nepse = stocksSnap?.nepse ?? null;
  const freshness = relativeFreshness(
    weatherSnap?.freshness.fetchedAt ?? stocksSnap?.freshness.fetchedAt,
    t,
  );

  // The pinned currencies, as many as fit one line.
  const history = loadedValue(forex)?.history ?? {};
  /** Since NRB's last rate before today's, per one unit, as NEPSE's card
   * shows its index: the move, and the move in percent. */
  const moveOf = (code: string, unit: number) => {
    const points = history[code] ?? [];
    if (points.length < 2) return null;
    const now = (points[points.length - 1] ?? 0) / unit;
    const before = (points[points.length - 2] ?? 0) / unit;
    if (!before) return null;
    return { change: now - before, percent: ((now - before) / before) * 100 };
  };
  const rates = (modules.forexEnabled ? (loadedValue(forex)?.rates ?? []) : [])
    .filter((rate) => modules.forexFavourites.includes(rate.currencyCode))
    .sort(
      (a, b) =>
        modules.forexFavourites.indexOf(a.currencyCode) -
        modules.forexFavourites.indexOf(b.currencyCode),
    )
    .slice(0, FOREX_ON_TODAY);

  if (!modules.weatherEnabled && !showNepse && rates.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        {modules.weatherEnabled && (
          <Pressable className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => navigate("/weather")}
              className="surface-card relative flex min-h-[72px] w-full flex-col p-2.5 text-left"
            >
              <div className="flex items-center gap-1 text-text-muted">
                <Icon name="weather" className="size-3 text-[color:var(--color-weather-tint)]" />
                <span className="text-[10px]">
                  {placeLabel(places, modules.weatherLocation, language)}
                </span>
              </div>
              <div className="mt-0.5 text-[20px] font-semibold leading-none">
                {weatherSnap ? (
                  formatCelsius(weatherSnap.temperatureCelsius)
                ) : (
                  <SkeletonBlock className="h-[18px] w-14" />
                )}
              </div>
              <p className="mt-1 truncate text-[10px] text-text-muted">
                {weatherSnap
                  ? `${conditionTitle(weatherSnap.condition, language)} · ${t("dashboard.high")} ${formatCelsius(weatherSnap.highCelsius)} ${t("dashboard.low")} ${formatCelsius(weatherSnap.lowCelsius)}`
                  : "—"}
              </p>
            </button>
          </Pressable>
        )}

        {showNepse && (
          <Pressable className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => navigate("/bazar?tab=stocks")}
              className="surface-card relative flex min-h-[72px] w-full flex-col p-2.5 text-left"
            >
              <div className="flex items-center gap-1 text-text-muted">
                <Icon name="interest" className="size-3 text-[color:var(--color-accent-mark)]" />
                <span className="text-[10px]">{t("dashboard.nepse")}</span>
              </div>
              <div className="mt-0.5 text-[18px] font-semibold leading-none tabular-nums">
                {nepse ? money.format(nepse.value) : <SkeletonBlock className="h-[16px] w-16" />}
              </div>
              <p
                className={`mt-1 truncate text-[10px] tabular-nums ${
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
      {rates.length > 0 && (
        // One slim card of equal cells, in the cards' own type: the code as
        // their label, the rate as their figure. Each opens Forex; pointed
        // at, a cell's filled star takes it off Today.
        <div
          // Alone, a currency takes a card's width, as weather and NEPSE do,
          // not the whole row.
          className={`surface-card grid divide-x divide-divider py-2 ${
            rates.length === 1 ? "w-[calc(50%-4px)]" : "w-full"
          }`}
          style={{ gridTemplateColumns: `repeat(${rates.length}, minmax(0, 1fr))` }}
        >
          {rates.map((rate) => {
            const move = moveOf(rate.currencyCode, rate.unit);
            const moveLine = move && (
              <span
                className={`block truncate text-[10px] tabular-nums ${
                  Math.abs(move.change) < 0.005 ? "text-text-muted" : changeTone(move.change)
                }`}
              >
                {Math.abs(move.change) < 0.005
                  ? t("dashboard.nepse-no-change")
                  : `${move.change > 0 ? "↑" : "↓"} ${money.format(Math.abs(move.change))} · ${Math.abs(move.percent).toFixed(2)}%`}
              </span>
            );
            return (
              <div key={rate.currencyCode} className="group relative min-w-0">
                <button
                  type="button"
                  onClick={() => navigate("/bazar?tab=forex")}
                  className="block w-full min-w-0 px-2.5 text-left"
                >
                  <span className="min-w-0">
                    <span className="block text-[10px] text-text-muted">{rate.currencyCode}</span>
                    <span className="mt-0.5 block truncate text-[13px] font-semibold leading-tight tabular-nums">
                      {money.format(rate.buy / rate.unit)}
                    </span>
                    {moveLine}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setModules((current) => ({
                      ...current,
                      forexFavourites: current.forexFavourites.filter(
                        (code) => code !== rate.currencyCode,
                      ),
                    }))
                  }
                  aria-label={`${t("forex.unfavourite")} ${rate.currencyCode}`}
                  title={t("forex.unfavourite")}
                  className="absolute top-0 right-1.5 grid size-4 place-items-center text-accent-mark opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <Icon name="starFill" className="size-2.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
      {freshness && <p className="px-0.5 text-[10px] text-text-muted">{freshness}</p>}
    </div>
  );
}
