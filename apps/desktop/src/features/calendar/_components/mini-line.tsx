import { useEffect, useState, useSyncExternalStore } from "react";
import { Icon } from "../../../shared/components/icon";
import { useSettings } from "../../../shared/context/settings-context";
import * as player from "../../../shared/lib/audio";
import { api, type UpcomingEvent } from "../../../shared/lib/ipc";
import { loadedValue } from "../../../shared/lib/load-state";
import { type MiniLine as Choice, nextMiniLine, setMiniLine } from "../../../shared/lib/mini-line";
import { digits } from "../../../shared/lib/numerals";
import { placeLabel, usePlaces } from "../../../shared/lib/places";
import type { ForexSnapshot } from "../../../types/api/ForexSnapshot";
import type { LoadState } from "../../../types/api/LoadState";
import type { StockMarketSnapshot } from "../../../types/api/StockMarketSnapshot";
import type { WeatherSnapshot } from "../../../types/api/WeatherSnapshot";
import { money } from "../../bazar/_lib/format";
import { changeTone } from "../../bazar/_lib/stock-tone";
import { formatCelsius } from "../../weather/_lib/format";

/** Asked again this often, so the strip stays current left on the desktop. */
const REFRESH_MS = 5 * 60 * 1000;

function useRadio() {
  return useSyncExternalStore(player.subscribe, player.getState, player.getState);
}

/** Loads `load` now and every few minutes while `on`. */
function usePolled<T>(on: boolean, load: () => Promise<T>): T | undefined {
  const [value, setValue] = useState<T>();
  useEffect(() => {
    if (!on) return;
    const run = () =>
      load()
        .then(setValue)
        .catch(() => {});
    run();
    const timer = window.setInterval(run, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [on, load]);
  return value;
}

const loadForex = () => api.getForex(false);
const loadStocks = () => api.getStocks();
const loadNext = () => api.upcomingEvents(1, 180).then((events) => events[0] ?? null);

/**
 * The strip's second line: whichever of the next festival, weather, NEPSE,
 * the dollar rate or the radio the user picked. Clicking it moves to the next
 * choice. A choice whose module is switched off, or radio with nothing
 * playing, falls back to the next festival rather than an empty line; a
 * reading that isn't current says so.
 */
export function MiniLine({ choice }: { choice: Choice }) {
  const { t, numerals, language, modules } = useSettings();
  const places = usePlaces();
  const radio = useRadio();

  const available: Choice[] = [
    "festival",
    ...(modules.weatherEnabled ? (["weather"] as const) : []),
    ...(modules.bazarEnabled ? (["nepse"] as const) : []),
    ...(modules.forexEnabled ? (["forex"] as const) : []),
    ...(modules.radioEnabled ? (["radio"] as const) : []),
  ];
  const wanted = available.includes(choice) ? choice : "festival";
  const shown: Choice = wanted === "radio" && !radio.nowPlaying ? "festival" : wanted;

  const location = modules.weatherLocation;
  const [weather, setWeather] = useState<LoadState<WeatherSnapshot>>();
  useEffect(() => {
    if (shown !== "weather") return;
    const run = () =>
      api
        .getWeather(false, location)
        .then(setWeather)
        .catch(() => {});
    run();
    const timer = window.setInterval(run, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [shown, location]);
  const stocks = usePolled<LoadState<StockMarketSnapshot>>(shown === "nepse", loadStocks);
  const forex = usePolled<LoadState<ForexSnapshot>>(shown === "forex", loadForex);
  const next = usePolled<UpcomingEvent | null>(shown === "festival", loadNext);

  const stale = (state: LoadState<unknown> | undefined) =>
    state?.status === "stale" ? ` · ${t("mini.not-current")}` : "";

  let content: React.ReactNode = null;
  if (shown === "festival" && next) {
    const when =
      next.days_away === 0
        ? t("relative.today")
        : next.days_away === 1
          ? t("relative.tomorrow")
          : t("relative.in-days").replace("{n}", digits(next.days_away, numerals));
    content = (
      <>
        <span
          className={`mini-view__dot${next.is_public_holiday ? " mini-view__dot--holiday" : ""}`}
        />
        {/* The name gives way before the "when": "Tomorrow" is the point. */}
        <span className="min-w-0 truncate">{next.name}</span>
        <span className="mini-view__muted shrink-0">&nbsp;· {when}</span>
      </>
    );
  } else if (shown === "weather") {
    const snap = loadedValue(weather);
    if (snap?.placeId === location) {
      content = (
        <span className="min-w-0 truncate">
          {placeLabel(places, location, language)} {formatCelsius(snap.temperatureCelsius)}
          <span className="mini-view__muted">{stale(weather)}</span>
        </span>
      );
    }
  } else if (shown === "nepse") {
    const nepse = loadedValue(stocks)?.nepse;
    if (nepse) {
      content = (
        <span className="min-w-0 truncate tabular-nums">
          NEPSE {money.format(nepse.value)}{" "}
          <span className={nepse.change === 0 ? "mini-view__muted" : changeTone(nepse.change)}>
            {nepse.change === 0
              ? t("dashboard.nepse-no-change")
              : `${nepse.change > 0 ? "↑" : "↓"} ${Math.abs(nepse.changePercent).toFixed(2)}%`}
          </span>
          <span className="mini-view__muted">{stale(stocks)}</span>
        </span>
      );
    }
  } else if (shown === "forex") {
    const usd = loadedValue(forex)?.rates.find((rate) => rate.currencyCode === "USD");
    if (usd) {
      content = (
        <span className="min-w-0 truncate tabular-nums">
          USD {money.format(usd.buy / usd.unit)}
          <span className="mini-view__muted">
            {" "}
            · {t("mini.buying")}
            {stale(forex)}
          </span>
        </span>
      );
    }
  } else if (shown === "radio" && radio.nowPlaying) {
    content = (
      <span className="min-w-0 truncate">
        {radio.nowPlaying.name}
        <span className="mini-view__muted">
          {" "}
          · {t(radio.isPlaying ? "mini.playing" : "mini.paused")}
        </span>
      </span>
    );
  }

  // Radio with nothing playing would show the festival again, so a click
  // would seem to do nothing; the cycle passes over it until it plays.
  const cycle = available.filter((option) => option !== "radio" || radio.nowPlaying);

  return (
    <button
      type="button"
      onClick={() => setMiniLine(nextMiniLine(shown, cycle))}
      title={t("mini.change-hint")}
      aria-label={`${t(`mini.line.${shown}`)}. ${t("mini.change-hint")}`}
      className="mini-view__switch"
    >
      <span className="mini-view__next flex min-w-0 items-center">
        {content ?? <span className="mini-view__muted">…</span>}
        {/* Shown on hover: this line is a button, and it switches. */}
        <Icon name="swap" className="mini-view__swap" />
      </span>
    </button>
  );
}
