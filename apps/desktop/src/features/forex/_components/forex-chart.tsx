import { useMemo, useState } from "react";
import useSWR from "swr";
import { SkeletonBlock } from "../../../shared/components/skeleton";
import { TabStrip } from "../../../shared/components/tab-strip";
import { useSettings } from "../../../shared/context/settings-context";
import { api } from "../../../shared/lib/ipc";
import { catchAsFailed, loadedValue } from "../../../shared/lib/load-state";
import { type ChartSpan, PriceChart } from "../../bazar/_components/price-chart";
import { percentText } from "../../bazar/_lib/crypto";
import { formatAmount } from "../_lib/format";

const RANGES = [
  { id: "1m", label: "1M", days: 31 },
  { id: "3m", label: "3M", days: 92 },
  { id: "1y", label: "1Y", days: 366 },
] as const;
type Range = (typeof RANGES)[number]["id"];

const DAY_SECONDS = 24 * 60 * 60;

/**
 * One currency's NRB buy rate over time. The year for every currency is one
 * cached fetch in Rust, shared by every chart; a range only decides how much
 * of it is drawn. Quoted per the currency's own unit, like the row above it.
 */
export function ForexChart({ code }: { code: string }) {
  const { t } = useSettings();
  const [range, setRange] = useState<Range>("3m");
  const { data, isLoading, mutate } = useSWR("forex-history", () =>
    catchAsFailed(api.getForexHistory()),
  );
  const history = loadedValue(data);

  const points = useMemo(() => {
    const all = (history?.series[code] ?? []).map((point) => ({
      time: point.time,
      price: point.buy,
    }));
    const days = RANGES.find((item) => item.id === range)?.days ?? 366;
    const latest = all.at(-1)?.time;
    if (latest === undefined) return all;
    return all.filter((point) => point.time > latest - days * DAY_SECONDS);
  }, [history, code, range]);

  const first = points[0];
  const last = points.at(-1);
  const move = first && last ? ((last.price - first.price) / first.price) * 100 : null;
  const prices = points.map((point) => point.price);
  const high = prices.length ? Math.max(...prices) : null;
  const low = prices.length ? Math.min(...prices) : null;
  const span: ChartSpan = range === "1y" ? "year" : "days";

  return (
    <div>
      <div className="relative">
        <TabStrip
          label={t("stocks.chart-range")}
          value={range}
          onChange={(next) => setRange(next as Range)}
          tabs={RANGES.map((item) => ({ id: item.id, label: item.label }))}
        />
        {move != null && (
          <span className="absolute top-0 right-0 text-[10px] leading-4 tabular-nums">
            <span className={`font-medium ${move >= 0 ? "text-positive" : "text-holiday"}`}>
              {percentText(move)}
            </span>{" "}
            <span className="text-text-muted">{t(`stocks.chart-over-${range}`)}</span>
          </span>
        )}
      </div>
      {isLoading && !history ? (
        <SkeletonBlock className="mt-2 h-[120px] w-full" />
      ) : points.length < 2 ? (
        <div className="mt-2 flex items-center gap-2 text-[10px] text-text-muted">
          <span className="min-w-0 flex-1">
            {history ? t("forex.chart-too-few") : t("stocks.chart-unavailable")}
          </span>
          {!history && (
            <button
              type="button"
              onClick={() => void mutate(catchAsFailed(api.getForexHistory(true)))}
              className="btn-ghost -mr-1.5 shrink-0 text-[10px] text-[color:var(--color-accent-mark)]"
            >
              {t("action.retry")}
            </button>
          )}
        </div>
      ) : (
        <>
          <PriceChart
            points={points}
            offsetSeconds={0}
            span={span}
            formatPrice={(price) => `Rs ${formatAmount(price)}`}
            label={t("forex.chart-label").replace("{code}", code)}
          />
          {high != null && low != null && (
            <p className="mt-1 flex justify-between text-[10px] text-text-muted tabular-nums">
              <span>
                {t("forex.chart-low")} Rs {formatAmount(low)}
              </span>
              <span>
                {t("forex.chart-high")} Rs {formatAmount(high)}
              </span>
            </p>
          )}
        </>
      )}
    </div>
  );
}
