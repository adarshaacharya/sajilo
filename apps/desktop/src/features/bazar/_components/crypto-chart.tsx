import {
  type AreaData,
  AreaSeries,
  ColorType,
  CrosshairMode,
  createChart,
  type IChartApi,
  type ISeriesApi,
  LineStyle,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { SkeletonBlock } from "../../../shared/components/skeleton";
import { TabStrip } from "../../../shared/components/tab-strip";
import { useSettings } from "../../../shared/context/settings-context";
import { api } from "../../../shared/lib/ipc";
import { catchAsFailed, loadedValue } from "../../../shared/lib/load-state";
import type { CryptoPricePoint } from "../../../types/api/CryptoPricePoint";
import { usePalette, withAlpha } from "../_lib/chart-palette";
import { CHART_RANGES, type ChartDays, percentText, usd } from "../_lib/crypto";

const HEIGHT = 120;

/**
 * lightweight-charts labels its axis in UTC. Sliding every sample by this
 * machine's offset makes it read the user's own clock, wherever they are.
 */
function localOffsetSeconds(): number {
  return -new Date().getTimezoneOffset() * 60;
}

/**
 * A coin's price over the chosen range, with the move across it. The range
 * tabs sit above the plot; each range is fetched once and cached in Rust.
 */
export function CryptoChart({ id }: { id: string }) {
  const { t } = useSettings();
  const [days, setDays] = useState<ChartDays>(7);
  const { data, isLoading, mutate } = useSWR(["crypto-chart", id, days], () =>
    catchAsFailed(api.getCryptoChart(id, days)),
  );
  const chart = loadedValue(data);
  const points = chart?.points ?? [];
  const first = points[0]?.price;
  const last = points.at(-1)?.price;
  const move = first && last ? ((last - first) / first) * 100 : null;

  return (
    <div className="section-divider mt-2.5 pt-1">
      <div className="relative">
        <TabStrip
          label={t("crypto.chart-range")}
          value={String(days)}
          onChange={(next) => setDays(Number(next) as ChartDays)}
          tabs={CHART_RANGES.map((range) => ({ id: String(range.days), label: range.label }))}
        />
        {move != null && (
          <span
            className={`absolute top-0 right-0 text-[10px] font-medium leading-4 tabular-nums ${move >= 0 ? "text-positive" : "text-holiday"}`}
          >
            {percentText(move)}
          </span>
        )}
      </div>
      {isLoading && !chart ? (
        <SkeletonBlock className="mt-2 h-[120px] w-full" />
      ) : points.length < 2 ? (
        <div className="mt-2 flex items-center gap-2 text-[10px] text-text-muted">
          <span className="min-w-0 flex-1">{t("crypto.chart-unavailable")}</span>
          <button
            type="button"
            onClick={() => void mutate()}
            className="btn-ghost -mr-1.5 shrink-0 text-[10px] text-[color:var(--color-accent-mark)]"
          >
            {t("action.retry")}
          </button>
        </div>
      ) : (
        <PriceChart points={points} days={days} />
      )}
    </div>
  );
}

function PriceChart({ points, days }: { points: readonly CryptoPricePoint[]; days: ChartDays }) {
  const { t, language } = useSettings();
  const palette = usePalette();
  const container = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Area"> | null>(null);
  const [hover, setHover] = useState<{ time: number; value: number } | null>(null);

  const data = useMemo<AreaData<UTCTimestamp>[]>(() => {
    const offset = localOffsetSeconds();
    return points.map((point) => ({
      time: (point.time + offset) as UTCTimestamp,
      value: point.price,
    }));
  }, [points]);
  const up = (points.at(-1)?.price ?? 0) >= (points[0]?.price ?? 0);

  // The axis says hours for a day, dates for longer, months for a year.
  const formats = useMemo(() => {
    const locale = language === "ne" ? "ne-NP-u-nu-latn" : "en-US-u-nu-latn";
    const make = (options: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" });
    return {
      tick: make(
        days === 1
          ? { hour: "numeric", minute: "2-digit" }
          : days === 365
            ? { month: "short", year: "2-digit" }
            : { month: "short", day: "numeric" },
      ),
      hover: make(
        days === 365
          ? { month: "short", day: "numeric", year: "numeric" }
          : { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
      ),
    };
  }, [days, language]);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const created = createChart(element, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        fontSize: 10,
        fontFamily: getComputedStyle(element).fontFamily,
        attributionLogo: false,
      },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      leftPriceScale: { visible: false },
      rightPriceScale: { visible: false, scaleMargins: { top: 0.2, bottom: 0.06 } },
      timeScale: {
        borderVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
        lockVisibleTimeRangeOnResize: true,
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        mode: CrosshairMode.Magnet,
        horzLine: { visible: false, labelVisible: false },
        vertLine: { labelVisible: false, style: LineStyle.Dashed, width: 1 },
      },
      handleScroll: false,
      handleScale: false,
    });
    const area = created.addSeries(AreaSeries, {
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerRadius: 3,
      crosshairMarkerBorderWidth: 0,
    });
    created.subscribeCrosshairMove((param) => {
      const sample = param.seriesData.get(area) as AreaData<UTCTimestamp> | undefined;
      setHover(
        param.time !== undefined && sample
          ? { time: param.time as number, value: sample.value }
          : null,
      );
    });
    chart.current = created;
    series.current = area;
    return () => {
      created.remove();
      chart.current = null;
      series.current = null;
    };
  }, []);

  useEffect(() => {
    series.current?.setData(data);
    chart.current?.timeScale().fitContent();
  }, [data]);

  useEffect(() => {
    const area = series.current;
    if (!chart.current || !area) return;
    const line = up ? palette.up : palette.down;
    const at = (time: unknown) => new Date((time as number) * 1000);
    chart.current.applyOptions({
      layout: { textColor: palette.muted },
      crosshair: { vertLine: { color: withAlpha(palette.muted, 0.6) } },
      timeScale: { tickMarkFormatter: (time: unknown) => formats.tick.format(at(time)) },
      localization: {
        timeFormatter: (time: unknown) => formats.hover.format(at(time)),
        priceFormatter: (price: number) => usd(price),
      },
    });
    area.applyOptions({
      lineColor: line,
      topColor: withAlpha(line, 0.22),
      bottomColor: withAlpha(line, 0),
      crosshairMarkerBackgroundColor: line,
    });
  }, [formats, palette, up]);

  return (
    <div className="relative mt-2">
      <div
        ref={container}
        role="img"
        aria-label={t("crypto.chart-label")}
        className="w-full"
        style={{ height: HEIGHT }}
      />
      {hover && (
        <p className="pointer-events-none absolute top-0 left-0 rounded bg-[color:var(--color-surface)] px-1 text-[10px] font-medium tabular-nums text-text-secondary">
          {formats.hover.format(new Date(hover.time * 1000))} · {usd(hover.value)}
        </p>
      )}
    </div>
  );
}
