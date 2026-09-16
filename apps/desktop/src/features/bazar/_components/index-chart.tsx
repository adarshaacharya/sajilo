import {
  type AreaData,
  AreaSeries,
  type AutoscaleInfo,
  ColorType,
  CrosshairMode,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  LineStyle,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useMemo, useRef, useState } from "react";
import { SkeletonBlock } from "../../../shared/components/skeleton";
import { useSettings } from "../../../shared/context/settings-context";
import { loadedValue } from "../../../shared/lib/load-state";
import type { IndexIntraday } from "../../../types/api/IndexIntraday";
import type { IndexPoint } from "../../../types/api/IndexPoint";
import type { LoadState } from "../../../types/api/LoadState";
import { money } from "../_lib/format";

/** Plot plus the time axis beneath it. */
const HEIGHT = 84;

/**
 * lightweight-charts labels its time axis in UTC. Sliding every sample by
 * Kathmandu's fixed +05:45 makes that axis read Nepal wall-clock time — the
 * only clock NEPSE trades on — wherever the user happens to be.
 */
const NEPAL_OFFSET_SECONDS = 5 * 3600 + 45 * 60;

type Palette = { up: string; down: string; muted: string };

function readPalette(): Palette {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => style.getPropertyValue(name).trim();
  return {
    up: token("--color-positive"),
    down: token("--color-holiday"),
    muted: token("--color-text-muted"),
  };
}

/**
 * The chart is painted on a canvas, so it cannot follow CSS variables by
 * itself. Re-read them whenever the theme changes, whether the user picked
 * one or the system switched.
 */
function usePalette(): Palette {
  const [palette, setPalette] = useState(readPalette);
  useEffect(() => {
    const refresh = () => setPalette(readPalette());
    const observer = new MutationObserver(refresh);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    const media = window.matchMedia("(prefers-color-scheme: light)");
    media.addEventListener("change", refresh);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", refresh);
    };
  }, []);
  return palette;
}

/** `#rrggbb` at an alpha, for the fill under the line. */
function withAlpha(hex: string, alpha: number): string {
  const digits = /^#([0-9a-f]{6})$/i.exec(hex)?.[1];
  if (!digits) return hex;
  const n = Number.parseInt(digits, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * NEPSE through its latest session, inside the index card. Deliberately
 * quiet: no price axis, no grid, no zoom or drag. Hovering reads out the
 * minute and the value; the dashed line is the previous close, so whether the
 * day is up or down shows without reading a number.
 */
export function IndexChart({
  state,
  previousClose,
  onRetry,
}: {
  state: LoadState<IndexIntraday> | undefined;
  previousClose: number;
  onRetry: () => void;
}) {
  const { t } = useSettings();
  const snapshot = loadedValue(state);

  if (!state || state.status === "loading") {
    return <SkeletonBlock className="mt-2.5 h-[84px] w-full" />;
  }

  if (!snapshot || snapshot.points.length < 2) {
    return (
      <div className="mt-2.5 flex items-center gap-2 text-[10px] text-text-muted">
        <span className="min-w-0 flex-1">{t("stocks.chart-unavailable")}</span>
        <button
          type="button"
          onClick={onRetry}
          className="btn-ghost -mr-1.5 shrink-0 text-[10px] text-[color:var(--color-accent-mark)]"
        >
          {t("action.retry")}
        </button>
      </div>
    );
  }

  return <SessionChart points={snapshot.points} previousClose={previousClose} />;
}

function SessionChart({
  points,
  previousClose,
}: {
  points: readonly IndexPoint[];
  previousClose: number;
}) {
  const { t, language } = useSettings();
  const palette = usePalette();
  const container = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Area"> | null>(null);
  const baseline = useRef<IPriceLine | null>(null);
  const previous = useRef(previousClose);
  const [hover, setHover] = useState<{ time: number; value: number } | null>(null);

  const data = useMemo<AreaData<UTCTimestamp>[]>(
    () =>
      points.map((point) => ({
        time: (Math.floor(Date.parse(point.time) / 1000) + NEPAL_OFFSET_SECONDS) as UTCTimestamp,
        value: point.value,
      })),
    [points],
  );
  const clock = useMemo(
    () =>
      new Intl.DateTimeFormat(language === "ne" ? "ne-NP-u-nu-latn" : "en-US-u-nu-latn", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "UTC",
      }),
    [language],
  );
  const up = (points.at(-1)?.value ?? previousClose) >= previousClose;

  // Built once; everything that can change is applied by the effects below.
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
      // The top band stays clear for the hover readout.
      rightPriceScale: { visible: false, scaleMargins: { top: 0.26, bottom: 0.06 } },
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
      // Keep the previous-close line in view even on a day that never came near it.
      autoscaleInfoProvider: (original: () => AutoscaleInfo | null) => {
        const range = original();
        if (!range?.priceRange) return range;
        return {
          ...range,
          priceRange: {
            minValue: Math.min(range.priceRange.minValue, previous.current),
            maxValue: Math.max(range.priceRange.maxValue, previous.current),
          },
        };
      },
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
      baseline.current = null;
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
    previous.current = previousClose;

    chart.current.applyOptions({
      layout: { textColor: palette.muted },
      crosshair: { vertLine: { color: withAlpha(palette.muted, 0.6) } },
      timeScale: {
        tickMarkFormatter: (time: unknown) => clock.format(new Date((time as number) * 1000)),
      },
      localization: {
        timeFormatter: (time: unknown) => clock.format(new Date((time as number) * 1000)),
        priceFormatter: (price: number) => money.format(price),
      },
    });
    area.applyOptions({
      lineColor: line,
      topColor: withAlpha(line, 0.22),
      bottomColor: withAlpha(line, 0),
      crosshairMarkerBackgroundColor: line,
    });

    if (baseline.current) area.removePriceLine(baseline.current);
    baseline.current = area.createPriceLine({
      price: previousClose,
      color: withAlpha(palette.muted, 0.7),
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: false,
      title: "",
    });
  }, [clock, palette, previousClose, up]);

  return (
    <div className="relative mt-2.5">
      <div
        ref={container}
        role="img"
        aria-label={t("stocks.chart-label")}
        className="w-full"
        style={{ height: HEIGHT }}
      />
      {hover && (
        <p className="pointer-events-none absolute top-0 left-0 rounded bg-[color:var(--color-surface)] px-1 text-[10px] font-medium tabular-nums text-text-secondary">
          {clock.format(new Date(hover.time * 1000))} · {money.format(hover.value)}
        </p>
      )}
    </div>
  );
}
