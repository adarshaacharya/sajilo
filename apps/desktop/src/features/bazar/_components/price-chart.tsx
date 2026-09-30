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
import { useSettings } from "../../../shared/context/settings-context";
import { usePalette, withAlpha } from "../_lib/chart-palette";

const HEIGHT = 120;

/** How far a chart reaches: one session (times of day), days to months
 * (dates), or a year and more (months). Picks the axis and hover labels. */
export type ChartSpan = "session" | "days" | "year";

/**
 * A price over time as a soft area, green when it ended up, red when down,
 * with the price and moment under the pointer. Shared by crypto and shares.
 *
 * lightweight-charts labels its axis in UTC; `offsetSeconds` slides every
 * sample so it reads the clock wanted instead: the user's own for crypto,
 * Nepal's for NEPSE's session, none for daily closes stamped at UTC midnight.
 */
export function PriceChart({
  points,
  offsetSeconds,
  span,
  formatPrice,
  label,
}: {
  points: readonly { time: number; price: number }[];
  offsetSeconds: number;
  span: ChartSpan;
  formatPrice: (price: number) => string;
  label: string;
}) {
  const { language } = useSettings();
  const palette = usePalette();
  const container = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Area"> | null>(null);
  const [hover, setHover] = useState<{ time: number; value: number } | null>(null);

  const data = useMemo<AreaData<UTCTimestamp>[]>(
    () =>
      points.map((point) => ({
        time: (point.time + offsetSeconds) as UTCTimestamp,
        value: point.price,
      })),
    [points, offsetSeconds],
  );
  const up = (points.at(-1)?.price ?? 0) >= (points[0]?.price ?? 0);

  // The axis says hours for a session, dates for longer, months for a year.
  const formats = useMemo(() => {
    const locale = language === "ne" ? "ne-NP-u-nu-latn" : "en-US-u-nu-latn";
    const make = (options: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" });
    return {
      tick: make(
        span === "session"
          ? { hour: "numeric", minute: "2-digit" }
          : span === "year"
            ? { month: "short", year: "2-digit" }
            : { month: "short", day: "numeric" },
      ),
      hover: make(
        span === "session"
          ? { hour: "numeric", minute: "2-digit" }
          : { month: "short", day: "numeric", year: "numeric" },
      ),
    };
  }, [span, language]);

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
        priceFormatter: (price: number) => formatPrice(price),
      },
    });
    area.applyOptions({
      lineColor: line,
      topColor: withAlpha(line, 0.22),
      bottomColor: withAlpha(line, 0),
      crosshairMarkerBackgroundColor: line,
    });
  }, [formats, palette, up, formatPrice]);

  return (
    <div className="relative mt-2">
      <div
        ref={container}
        role="img"
        aria-label={label}
        className="w-full"
        style={{ height: HEIGHT }}
      />
      {hover && (
        <p className="pointer-events-none absolute top-0 left-0 rounded bg-[color:var(--color-surface)] px-1 text-[10px] font-medium tabular-nums text-text-secondary">
          {formats.hover.format(new Date(hover.time * 1000))} · {formatPrice(hover.value)}
        </p>
      )}
    </div>
  );
}
