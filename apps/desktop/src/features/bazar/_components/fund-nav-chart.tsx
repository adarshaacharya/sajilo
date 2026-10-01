import { useMemo, useState } from "react";
import useSWR from "swr";
import { SkeletonBlock } from "../../../shared/components/skeleton";
import { TabStrip } from "../../../shared/components/tab-strip";
import { useSettings } from "../../../shared/context/settings-context";
import { api } from "../../../shared/lib/ipc";
import { catchAsFailed, loadedValue } from "../../../shared/lib/load-state";
import { percentText } from "../_lib/crypto";
import { monthYear, navFormat } from "../_lib/funds";
import { type ChartSpan, PriceChart } from "./price-chart";

const RANGES = [
  { id: "1m", label: "1M", days: 31 },
  { id: "3m", label: "3M", days: 92 },
  { id: "1y", label: "1Y", days: 366 },
  { id: "all", label: "All", days: null },
] as const;
type Range = (typeof RANGES)[number]["id"];

const DAY_SECONDS = 24 * 60 * 60;

/**
 * An open-end fund's NAV over time, from ShareSansar: daily where the manager
 * publishes daily, weekly before that. It never trades on NEPSE, so this is
 * the only history it has. The whole series is fetched once and cached in
 * Rust; a range only decides how much of it is drawn.
 */
export function FundNavChart({ symbol }: { symbol: string }) {
  const { t, language } = useSettings();
  const [range, setRange] = useState<Range>("1y");
  const { data, isLoading, mutate } = useSWR(["fund-nav-history", symbol], () =>
    catchAsFailed(api.getFundNavHistory(symbol)),
  );
  const history = loadedValue(data);

  const points = useMemo(() => {
    const all = (history?.points ?? []).map((point) => ({ time: point.time, price: point.nav }));
    const days = RANGES.find((item) => item.id === range)?.days ?? null;
    const latest = all.at(-1)?.time;
    if (days === null || latest === undefined) return all;
    return all.filter((point) => point.time > latest - days * DAY_SECONDS);
  }, [history, range]);

  const first = points[0];
  const last = points.at(-1);
  const move = first && last ? ((last.price - first.price) / first.price) * 100 : null;
  const span: ChartSpan = range === "1y" || range === "all" ? "year" : "days";
  const since = first
    ? monthYear(new Date(first.time * 1000).toISOString().slice(0, 10), language)
    : "";

  return (
    <div className="section-divider mt-2.5 pt-1">
      <div className="relative">
        <TabStrip
          label={t("stocks.chart-range")}
          value={range}
          onChange={(next) => setRange(next as Range)}
          tabs={RANGES.map((item) => ({
            id: item.id,
            label: item.id === "all" ? t("funds.chart-all") : item.label,
          }))}
        />
        {move != null && (
          <span className="absolute top-0 right-0 text-[10px] leading-4 tabular-nums">
            <span className={`font-medium ${move >= 0 ? "text-positive" : "text-holiday"}`}>
              {percentText(move)}
            </span>{" "}
            <span className="text-text-muted">
              {range === "all"
                ? t("funds.chart-since").replace("{date}", since)
                : t(`stocks.chart-over-${range}`)}
            </span>
          </span>
        )}
      </div>
      {isLoading && !history ? (
        <SkeletonBlock className="mt-2 h-[120px] w-full" />
      ) : points.length < 2 ? (
        <div className="mt-2 flex items-center gap-2 text-[10px] text-text-muted">
          <span className="min-w-0 flex-1">
            {history ? t("funds.chart-too-few") : t("stocks.chart-unavailable")}
          </span>
          {!history && (
            <button
              type="button"
              onClick={() => void mutate(catchAsFailed(api.getFundNavHistory(symbol, true)))}
              className="btn-ghost -mr-1.5 shrink-0 text-[10px] text-[color:var(--color-accent-mark)]"
            >
              {t("action.retry")}
            </button>
          )}
        </div>
      ) : (
        <PriceChart
          points={points}
          offsetSeconds={0}
          span={span}
          formatPrice={(nav) => `Rs ${navFormat.format(nav)}`}
          label={t("funds.chart-label").replace("{symbol}", symbol)}
        />
      )}
    </div>
  );
}

const RETURN_SPANS = [
  { label: "1M", days: 31 },
  { label: "3M", days: 92 },
  { label: "6M", days: 183 },
  { label: "1Y", days: 366 },
] as const;

/** How many of the latest NAVs the table lists. */
const RECENT = 7;

/** The same history the chart draws, from the same cache. */
function useNavHistory(symbol: string) {
  const { data } = useSWR(["fund-nav-history", symbol], () =>
    catchAsFailed(api.getFundNavHistory(symbol)),
  );
  return loadedValue(data)?.points ?? [];
}

function changeClass(change: number) {
  return change > 0 ? "text-positive" : change < 0 ? "text-holiday" : "text-text-muted";
}

/**
 * Returns over the spans the portals list (1M, 3M, 6M, 1Y, since start) and
 * the latest NAVs as rows, the way ShareSansar and ShareHub lay a fund out.
 * A span the history does not reach back to is left blank, not guessed.
 */
export function FundNavTables({ symbol }: { symbol: string }) {
  const { t, language } = useSettings();
  const points = useNavHistory(symbol);
  const last = points.at(-1);
  if (points.length < 2 || !last) return null;
  const at = (days: number) => {
    const target = last.time - days * DAY_SECONDS;
    // The newest NAV on or before the target day.
    return [...points].reverse().find((point) => point.time <= target) ?? null;
  };
  const returns = [
    ...RETURN_SPANS.map((span) => ({ label: span.label, from: at(span.days) })),
    { label: t("funds.returns-since"), from: points[0] ?? null },
  ].map(({ label, from }) => ({
    label,
    change: from ? ((last.nav - from.nav) / from.nav) * 100 : null,
  }));
  const recent = points.slice(-(RECENT + 1));
  const rows = recent
    .slice(1)
    .map((point, index) => {
      const before = recent[index]?.nav ?? point.nav;
      return {
        date: monthDay(point.time, language),
        nav: point.nav,
        change: ((point.nav - before) / before) * 100,
      };
    })
    .reverse();

  return (
    <>
      <div className="section-divider mt-2.5 pt-2">
        <p className="mb-1.5 text-[10px] text-text-muted">{t("funds.returns")}</p>
        <div className="grid grid-cols-5 gap-1 text-center">
          {returns.map((item) => (
            <div key={item.label}>
              <p className="truncate text-[10px] text-text-muted">{item.label}</p>
              <p
                className={`text-[11px] font-semibold tabular-nums ${item.change == null ? "text-text-muted" : changeClass(item.change)}`}
              >
                {item.change == null ? "–" : percentText(item.change)}
              </p>
            </div>
          ))}
        </div>
      </div>
      <div className="section-divider mt-2.5 pt-2">
        <p className="mb-1 text-[10px] text-text-muted">{t("funds.recent-navs")}</p>
        <table className="w-full text-[11px] tabular-nums">
          <thead>
            <tr className="text-[10px] text-text-muted">
              <th className="py-0.5 text-left font-normal">{t("funds.col-date")}</th>
              <th className="py-0.5 text-right font-normal">{t("funds.col-nav")}</th>
              <th className="py-0.5 text-right font-normal">{t("funds.col-change")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.date} className="border-t border-divider">
                <td className="py-1 text-text-secondary">{row.date}</td>
                <td className="py-1 text-right">Rs {navFormat.format(row.nav)}</td>
                <td className={`py-1 text-right ${changeClass(row.change)}`}>
                  {percentText(row.change)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function monthDay(time: number, language: "en" | "ne") {
  return new Intl.DateTimeFormat(language === "ne" ? "ne-NP-u-nu-latn" : "en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(time * 1000));
}
