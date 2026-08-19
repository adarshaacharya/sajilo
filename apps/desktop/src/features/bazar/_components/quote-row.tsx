import type { StockQuote } from "../../../types/api/StockQuote";
import { money } from "../_lib/format";
import { changeTone, percentText } from "../_lib/stock-tone";
import { FollowButton } from "./follow-button";

export function QuoteRow({
  quote,
  followed,
  onOpen,
  onToggle,
}: {
  quote: StockQuote;
  followed: boolean;
  onOpen: () => void;
  onToggle: () => void;
}) {
  return (
    <div className="row-line flex items-center gap-2 py-1.5">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold">{quote.symbol}</span>
          {quote.companyName && (
            <span className="block truncate text-[10px] text-text-muted">{quote.companyName}</span>
          )}
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
