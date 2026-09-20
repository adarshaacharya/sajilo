import { useSettings } from "../../../shared/context/settings-context";
import type { StockPosition } from "../../../types/api/StockPosition";
import type { StockQuote } from "../../../types/api/StockQuote";
import { money, money0 } from "../_lib/format";
import { changeTone, percentText } from "../_lib/stock-tone";
import { FollowButton } from "./follow-button";

/**
 * A company as the market sees it: last price and today's move. Ownership only
 * ever appears as a quiet subtitle here — what a holding is worth belongs to
 * `HoldingRow`, so one column never has to mean two things.
 */
export function QuoteRow({
  quote,
  followed,
  onOpen,
  onToggle,
  position,
}: {
  quote: StockQuote;
  followed: boolean;
  onOpen: () => void;
  onToggle: () => void;
  position?: StockPosition;
}) {
  const { t } = useSettings();
  const owned = position && position.quantity > 0;
  return (
    <div className="row-line flex items-center gap-2 rounded-md px-1.5 py-1.5 transition-colors hover:bg-surface-hover">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-1 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold">{quote.symbol}</span>
          {owned ? (
            <span className="block truncate text-[10px] text-text-muted tabular-nums">
              {t("stocks.portfolio-owned-short")} {money0.format(position.quantity)}{" "}
              {t("stocks.portfolio-kitta")}
            </span>
          ) : quote.companyName ? (
            <span className="block truncate text-[10px] text-text-muted">{quote.companyName}</span>
          ) : null}
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-[13px] font-medium tabular-nums">
            Rs {money.format(quote.ltp)}
          </span>
          <span
            className={`block text-[10px] font-medium tabular-nums ${changeTone(quote.change)}`}
          >
            {percentText(quote.change, quote.changePercent)}
          </span>
        </span>
      </button>
      <FollowButton followed={followed} onToggle={onToggle} />
    </div>
  );
}
