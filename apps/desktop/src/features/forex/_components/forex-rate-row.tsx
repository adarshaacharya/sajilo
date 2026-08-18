import type { ForexRate } from "../../../types/api/ForexRate";
import { formatAmount, unitLabel } from "../_lib/format";

export function ForexRateRow({ rate }: { rate: ForexRate }) {
  return (
    <div className="row-line flex items-baseline justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="text-[13px] font-medium">{unitLabel(rate)}</p>
        <p className="truncate text-[11px] text-text-muted">{rate.currencyName}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[13px] font-medium tabular-nums">{formatAmount(rate.buy)}</p>
        <p className="text-[11px] text-text-muted tabular-nums">sell {formatAmount(rate.sell)}</p>
      </div>
    </div>
  );
}
