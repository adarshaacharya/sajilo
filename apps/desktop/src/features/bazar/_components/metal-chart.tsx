import { useMemo, useState } from "react";
import useSWR from "swr";
import { SkeletonBlock } from "../../../shared/components/skeleton";
import { TabStrip } from "../../../shared/components/tab-strip";
import { useSettings } from "../../../shared/context/settings-context";
import { api } from "../../../shared/lib/ipc";
import { catchAsFailed, loadedValue } from "../../../shared/lib/load-state";
import { percentText } from "../_lib/crypto";
import { money } from "../_lib/format";
import { type ChartSpan, PriceChart } from "./price-chart";

const METALS = ["gold", "silver"] as const;
type ChartMetal = (typeof METALS)[number];

const RANGES = [
  { id: "1m", label: "1M", days: 31 },
  { id: "3m", label: "3M", days: 92 },
  { id: "1y", label: "1Y", days: 366 },
] as const;
type Range = (typeof RANGES)[number]["id"];

const DAY_SECONDS = 24 * 60 * 60;

/**
 * Hallmark gold or silver per tola over the last year. The year is one
 * cached fetch from NepaliPatro, which republishes the Federation's rate for
 * every trading day; a range only decides how much of it is drawn.
 */
export function MetalChart() {
  const { t } = useSettings();
  const [metal, setMetal] = useState<ChartMetal>("gold");
  const [range, setRange] = useState<Range>("3m");
  const { data, isLoading, mutate } = useSWR("metal-history", () =>
    catchAsFailed(api.getMetalHistory()),
  );
  const history = loadedValue(data);

  const points = useMemo(() => {
    const all = history?.[metal] ?? [];
    const days = RANGES.find((item) => item.id === range)?.days ?? 366;
    const latest = all.at(-1)?.time;
    if (latest === undefined) return all;
    return all.filter((point) => point.time > latest - days * DAY_SECONDS);
  }, [history, metal, range]);

  const first = points[0];
  const last = points.at(-1);
  const move = first && last ? ((last.price - first.price) / first.price) * 100 : null;
  const prices = points.map((point) => point.price);
  const span: ChartSpan = range === "1y" ? "year" : "days";
  const name = metal === "gold" ? t("metals.chart-gold") : t("metals.chart-silver");

  return (
    <div>
      <div className="relative">
        <TabStrip
          label={t("metals.chart-metal")}
          value={metal}
          onChange={setMetal}
          tabs={METALS.map((id) => ({
            id,
            label: id === "gold" ? t("metals.chart-gold") : t("metals.chart-silver"),
          }))}
        />
        <div
          role="tablist"
          aria-label={t("stocks.chart-range")}
          className="absolute top-0 right-0 flex gap-2.5"
        >
          {RANGES.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={item.id === range}
              onClick={() => setRange(item.id)}
              className={`pt-0.5 text-[11px] font-medium transition-colors duration-150 ${
                item.id === range ? "text-text" : "text-text-muted hover:text-text-secondary"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {isLoading && !history ? (
        <SkeletonBlock className="mt-2 h-[120px] w-full" />
      ) : points.length < 2 ? (
        <div className="mt-2 flex items-center gap-2 text-[10px] text-text-muted">
          <span className="min-w-0 flex-1">
            {history ? t("metals.chart-too-few") : t("stocks.chart-unavailable")}
          </span>
          {!history && (
            <button
              type="button"
              onClick={() => void mutate(catchAsFailed(api.getMetalHistory(true)))}
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
            formatPrice={(price) => `Rs ${money.format(price)}`}
            label={t("metals.chart-label").replace("{metal}", name)}
          />
          <p className="mt-1 flex justify-between gap-2 text-[10px] text-text-muted tabular-nums">
            <span>
              {t("forex.chart-low")} Rs {money.format(Math.min(...prices))}
              {" · "}
              {t("forex.chart-high")} Rs {money.format(Math.max(...prices))}
            </span>
            {move != null && (
              <span>
                <span className={`font-medium ${move >= 0 ? "text-positive" : "text-holiday"}`}>
                  {percentText(move)}
                </span>{" "}
                {t(`stocks.chart-over-${range}`)}
              </span>
            )}
          </p>
        </>
      )}
    </div>
  );
}
