import type { ForexRate } from "../../../types/api/ForexRate";
import { formatAmount, unitLabel } from "../_lib/format";

/** A currency's buy and sell. Tapping it makes it the converter's currency,
 * and the chart above follows. */
export function ForexRateRow({
  rate,
  selected = false,
  onSelect,
}: {
  rate: ForexRate;
  selected?: boolean;
  onSelect?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className="row-line flex w-full items-baseline justify-between gap-3 py-2 text-left"
    >
      <div className="min-w-0">
        <p
          className={`text-[13px] font-medium ${selected ? "text-[color:var(--color-forex-tint)]" : ""}`}
        >
          {unitLabel(rate)}
        </p>
        <p className="truncate text-[11px] text-text-muted">{rate.currencyName}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[13px] font-medium tabular-nums">{formatAmount(rate.buy)}</p>
        <p className="text-[11px] text-text-muted tabular-nums">sell {formatAmount(rate.sell)}</p>
      </div>
    </button>
  );
}
