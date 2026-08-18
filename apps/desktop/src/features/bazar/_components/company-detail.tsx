import { Icon } from "../../../shared/components/icon";
import type { translate } from "../../../shared/lib/i18n";
import type { StockQuote } from "../../../types/api/StockMarketSnapshot";
import { money, money0 } from "../_lib/format";
import { changeText, changeTone, week52Position } from "../_lib/stock-tone";
import { FollowButton } from "./follow-button";
import { RangeBar } from "./range-bar";

type TranslationKey = Parameters<typeof translate>[0];
type TFn = (key: TranslationKey) => string;

async function openSharesansar(symbol: string) {
  const url = `https://www.sharesansar.com/company/${symbol.toLowerCase()}`;
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export function CompanyDetail({
  quote,
  followed,
  onBack,
  onToggle,
  t,
}: {
  quote: StockQuote;
  followed: boolean;
  onBack: () => void;
  onToggle: () => void;
  t: TFn;
}) {
  const dayPos =
    quote.low != null && quote.high != null && quote.high > quote.low
      ? (quote.ltp - quote.low) / (quote.high - quote.low)
      : null;

  const stats: { label: string; value: string }[] = [
    { label: t("stocks.open"), value: quote.open != null ? money.format(quote.open) : "—" },
    { label: t("stocks.high"), value: quote.high != null ? money.format(quote.high) : "—" },
    { label: t("stocks.low"), value: quote.low != null ? money.format(quote.low) : "—" },
    { label: t("stocks.prev-close"), value: money.format(quote.previousClose) },
    { label: t("stocks.vwap"), value: quote.vwap != null ? money.format(quote.vwap) : "—" },
    {
      label: t("stocks.traded"),
      value: quote.volume != null ? money0.format(quote.volume) : "—",
    },
    {
      label: t("stocks.trades"),
      value: quote.transactions != null ? money0.format(quote.transactions) : "—",
    },
    {
      label: t("stocks.avg-120"),
      value: quote.average120Day != null ? money.format(quote.average120Day) : "—",
    },
    {
      label: t("stocks.avg-180"),
      value: quote.average180Day != null ? money.format(quote.average180Day) : "—",
    },
  ];

  return (
    <section className="surface-card p-2.5">
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label={t("action.back")}
          className="icon-btn shrink-0"
        >
          <Icon name="chevronLeft" className="size-3.5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-semibold leading-tight">{quote.symbol}</p>
          {quote.companyName && <p className="text-[11px] text-text-muted">{quote.companyName}</p>}
        </div>
        <FollowButton followed={followed} onToggle={onToggle} />
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <p className="text-[22px] font-semibold tabular-nums">Rs {money.format(quote.ltp)}</p>
        <p className={`text-[11px] font-medium tabular-nums ${changeTone(quote.change)}`}>
          {changeText(quote.change, quote.changePercent)}
        </p>
      </div>

      <div className="mt-2 space-y-2">
        {quote.week52Low != null && quote.week52High != null && (
          <RangeBar
            title={t("stocks.week52")}
            low={quote.week52Low}
            high={quote.week52High}
            position={week52Position(quote)}
          />
        )}
        {quote.low != null && quote.high != null && quote.high > quote.low && (
          <RangeBar
            title={t("stocks.day-range")}
            low={quote.low}
            high={quote.high}
            position={dayPos}
          />
        )}
      </div>

      <div className="section-divider mt-3 grid grid-cols-3 gap-2 pt-2">
        {stats.map((stat) => (
          <div key={stat.label}>
            <p className="truncate text-[10px] text-text-muted">{stat.label}</p>
            <p className="text-[11px] font-medium tabular-nums">{stat.value}</p>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => openSharesansar(quote.symbol)}
        className="mt-2 text-[11px] text-[color:var(--color-accent-mark)] hover:opacity-80"
      >
        {t("stocks.open-sharesansar")}
      </button>
    </section>
  );
}
