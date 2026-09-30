import { useState } from "react";
import useSWR from "swr";
import { SkeletonBlock } from "../../../shared/components/skeleton";
import { TabStrip } from "../../../shared/components/tab-strip";
import { useSettings } from "../../../shared/context/settings-context";
import { api } from "../../../shared/lib/ipc";
import { catchAsFailed, loadedValue } from "../../../shared/lib/load-state";
import { percentText } from "../_lib/crypto";
import { money } from "../_lib/format";
import { type ChartSpan, PriceChart } from "./price-chart";

const RANGES = [
  { id: "1d", label: "1D" },
  { id: "1w", label: "1W" },
  { id: "1m", label: "1M" },
  { id: "3m", label: "3M" },
  { id: "1y", label: "1Y" },
  { id: "5y", label: "5Y" },
] as const;
type Range = (typeof RANGES)[number]["id"];

/** NEPSE's session is in Nepal time wherever the reader is: +5:45. */
const NEPAL_OFFSET_SECONDS = (5 * 60 + 45) * 60;

const span = (range: Range): ChartSpan =>
  range === "1d" ? "session" : range === "1y" || range === "5y" ? "year" : "days";

/**
 * A share's price over the chosen range, from ShareHub: the latest session
 * trade by trade, or one close a day for longer. Each range is fetched once
 * and cached in Rust.
 */
export function StockChart({ symbol }: { symbol: string }) {
  const { t } = useSettings();
  const [range, setRange] = useState<Range>("1m");
  const { data, isLoading, mutate } = useSWR(["stock-chart", symbol, range], () =>
    catchAsFailed(api.getStockChart(symbol, range)),
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
          label={t("stocks.chart-range")}
          value={range}
          onChange={(next) => setRange(next as Range)}
          tabs={RANGES.map((item) => ({ id: item.id, label: item.label }))}
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
          <span className="min-w-0 flex-1">{t("stocks.chart-unavailable")}</span>
          <button
            type="button"
            onClick={() => void mutate()}
            className="btn-ghost -mr-1.5 shrink-0 text-[10px] text-[color:var(--color-accent-mark)]"
          >
            {t("action.retry")}
          </button>
        </div>
      ) : (
        <PriceChart
          points={points}
          offsetSeconds={range === "1d" ? NEPAL_OFFSET_SECONDS : 0}
          span={span(range)}
          formatPrice={(price) => `Rs ${money.format(price)}`}
          label={t("stocks.chart-label").replace("{symbol}", symbol)}
        />
      )}
    </div>
  );
}
